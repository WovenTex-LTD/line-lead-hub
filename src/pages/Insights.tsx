import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayInTimezone } from "@/lib/date-utils";
import { effectivePoly } from "@/lib/finishing-utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, TrendingUp, TrendingDown, Target, Users, AlertTriangle,
  Package, BarChart3, Calendar, ArrowUp, ArrowDown,
  Minus, Zap, Clock, CheckCircle2, XCircle, ChevronRight, Box, Archive,
  DollarSign, Wallet, PiggyBank, Percent
} from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { PeriodComparison } from "@/components/insights/PeriodComparison";
import { LineDrillDown } from "@/components/insights/LineDrillDown";
import { ReportExportDialog } from "@/components/ReportExportDialog";
import { InsightsReportDialog } from "@/components/insights/InsightsReportDialog";

import { LineEfficiencyTargets } from "@/components/insights/LineEfficiencyTargets";

import { InteractiveChart } from "@/components/ui/interactive-chart";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";

interface DailyData {
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

interface LinePerformance {
  lineName: string;
  lineId: string;
  totalOutput: number;
  totalTarget: number;
  efficiency: number;
  avgManpower: number;
  submissions: number;
  blockers: number;
}

interface BlockerBreakdown {
  type: string;
  count: number;
  impact: string;
}

interface WorkOrderProgress {
  poNumber: string;
  buyer: string;
  style: string;
  orderQty: number;
  totalOutput: number;
  progress: number;
  lineName: string | null;
}

interface InsightSummary {
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
  efficiencyTrend: 'up' | 'down' | 'stable';
  outputTrend: 'up' | 'down' | 'stable';
  previousPeriodEfficiency: number;
  previousPeriodOutput: number;
}

interface PreviousPeriodData {
  totalOutput: number;
  totalQcPass: number;
  avgEfficiency: number;
  totalBlockers: number;
  avgManpower: number;
  daysWithData: number;
}

interface FinancialData {
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
  sewingCost: number;
  cuttingCost: number;
  finishingCost: number;
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

export default function Insights() {
  const { profile, factory } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '14' | '21' | '30'>('7');
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [linePerformance, setLinePerformance] = useState<LinePerformance[]>([]);
  const [blockerBreakdown, setBlockerBreakdown] = useState<BlockerBreakdown[]>([]);
  const [workOrderProgress, setWorkOrderProgress] = useState<WorkOrderProgress[]>([]);
  const [previousPeriodData, setPreviousPeriodData] = useState<PreviousPeriodData>({
    totalOutput: 0,
    totalQcPass: 0,
    avgEfficiency: 0,
    totalBlockers: 0,
    avgManpower: 0,
    daysWithData: 0,
  });
  const [summary, setSummary] = useState<InsightSummary>({
    totalSewingOutput: 0,
    totalFinishingQcPass: 0,
    avgDailyOutput: 0,
    avgDailyQcPass: 0,
    avgEfficiency: 0,
    totalBlockers: 0,
    openBlockers: 0,
    resolvedBlockers: 0,
    avgManpower: 0,
    daysWithData: 0,
    topPerformingLine: null,
    worstPerformingLine: null,
    mostCommonBlockerType: null,
    efficiencyTrend: 'stable',
    outputTrend: 'stable',
    previousPeriodEfficiency: 0,
    previousPeriodOutput: 0,
  });

  // Financial state
  const { headcountCost, isConfigured: costConfigured, getCurrencySymbol } = useHeadcountCost();
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);
  const [financialData, setFinancialData] = useState<FinancialData>({
    totalRevenue: 0, totalCost: 0, profit: 0, margin: 0,
    sewingCost: 0, cuttingCost: 0, finishingCost: 0,
    revenueByPo: [], profitByPo: [], dailyFinancials: [],
    costPerPiece: 0, revenuePerPiece: 0,
    prevRevenue: 0, prevCost: 0, prevProfit: 0, prevMargin: 0,
    hasData: false,
  });

  // Fetch BDT→USD exchange rate
  useEffect(() => {
    let cancelled = false;
    async function fetchRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const json = await res.json();
        if (!cancelled && json?.rates?.BDT) {
          setBdtToUsd(1 / json.rates.BDT);
        }
      } catch {
        if (!cancelled) setBdtToUsd(1 / 121);
      }
    }
    fetchRate();
    return () => { cancelled = true; };
  }, []);

  // Line drill-down state
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedLineName, setSelectedLineName] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Y-axis domain controls for charts
  const [sewingYMin, setSewingYMin] = useState(0);
  const [sewingYMax, setSewingYMax] = useState<number | 'auto'>('auto');
  const [finishingYMin, setFinishingYMin] = useState(0);
  const [finishingYMax, setFinishingYMax] = useState<number | 'auto'>('auto');

  // Compute auto Y-max from data
  const sewingAutoMax = useMemo(() => {
    if (dailyData.length === 0) return 1000;
    const max = Math.max(...dailyData.map(d => Math.max(d.sewingOutput, d.sewingTarget)));
    return Math.ceil(max / 500) * 500 || 1000;
  }, [dailyData]);

  const finishingAutoMax = useMemo(() => {
    if (dailyData.length === 0) return 1000;
    const max = Math.max(...dailyData.map(d => Math.max(d.finishingPolyOutput, d.finishingPolyTarget)));
    return Math.ceil(max / 500) * 500 || 1000;
  }, [dailyData]);

  const effectiveSewingYMax = sewingYMax === 'auto' ? sewingAutoMax : sewingYMax;
  const effectiveFinishingYMax = finishingYMax === 'auto' ? finishingAutoMax : finishingYMax;

  useEffect(() => {
    if (profile?.factory_id) {
      fetchInsights();
    }
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
      const startDateStr = startDate.toISOString().split('T')[0];

      // Store date range for drill-down
      setDateRange({ start: startDateStr, end: today });

      // Previous period for comparison
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - days);
      const prevStartDateStr = prevStartDate.toISOString().split('T')[0];

      // Fetch sewing actuals (end-of-day output, manpower, blockers, hours for cost)
      const { data: sewingActualsData } = await supabase
        .from('sewing_actuals')
        .select('*, lines(name, line_id), work_orders(po_number, buyer, style, order_qty, cm_per_dozen), blocker_types:blocker_type_id(name)')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', startDateStr)
        .lte('production_date', today)
        .order('production_date', { ascending: true });

      // Fetch sewing targets (morning targets)
      const { data: sewingTargetsData } = await supabase
        .from('sewing_targets')
        .select('production_date, line_id, per_hour_target, manpower_planned, lines(name, line_id)')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', startDateStr)
        .lte('production_date', today);

      // Fetch previous period sewing data
      const { data: prevSewingActuals } = await supabase
        .from('sewing_actuals')
        .select('good_today, manpower_actual, has_blocker, production_date')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', prevStartDateStr)
        .lt('production_date', startDateStr);

      const { data: prevSewingTargets } = await supabase
        .from('sewing_targets')
        .select('per_hour_target')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', prevStartDateStr)
        .lt('production_date', startDateStr);

      // Fetch finishing data from finishing_daily_logs (poly + carton = output)
      const { data: finishingDailyLogs } = await supabase
        .from('finishing_daily_logs')
        .select('*, lines(name, line_id), work_orders(po_number, buyer, style, order_qty, cm_per_dozen)')
        .eq('factory_id', profile.factory_id)
        .eq('log_type', 'OUTPUT')
        .gte('production_date', startDateStr)
        .lte('production_date', today)
        .order('production_date', { ascending: true });

      // Fetch finishing TARGET logs (for planned_hours + per-process hourly targets)
      const { data: finishingTargetLogs } = await supabase
        .from('finishing_daily_logs')
        .select('*')
        .eq('factory_id', profile.factory_id)
        .eq('log_type', 'TARGET')
        .gte('production_date', startDateStr)
        .lte('production_date', today)
        .order('production_date', { ascending: true });

      // Fetch previous period finishing data from finishing_daily_logs
      const { data: prevFinishingDailyLogs } = await supabase
        .from('finishing_daily_logs')
        .select('poly, carton')
        .eq('factory_id', profile.factory_id)
        .eq('log_type', 'OUTPUT')
        .gte('production_date', prevStartDateStr)
        .lte('production_date', startDateStr);

      // Fetch cutting actuals for cost calculation
      const { data: cuttingActualsData } = await supabase
        .from('cutting_actuals')
        .select('*, work_orders(po_number, buyer, style, cm_per_dozen)')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', startDateStr)
        .lte('production_date', today);

      // Previous period financial data
      const { data: prevFinishingOutputLogs } = await supabase
        .from('finishing_daily_logs')
        .select('poly, production_date, m_power_actual, actual_hours, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen, po_number)')
        .eq('factory_id', profile.factory_id)
        .eq('log_type', 'OUTPUT')
        .gte('production_date', prevStartDateStr)
        .lt('production_date', startDateStr);

      const { data: prevCuttingActuals } = await supabase
        .from('cutting_actuals')
        .select('man_power, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen)')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', prevStartDateStr)
        .lt('production_date', startDateStr);

      // Fetch work orders for progress tracking
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('*, lines(name, line_id)')
        .eq('factory_id', profile.factory_id)
        .eq('is_active', true);

      // Build pairing sets: only count targets that have matching actuals
      // Sewing: match by line_id + production_date
      const sewingActualKeys = new Set(
        sewingActualsData?.map(u => `${u.line_id}_${u.production_date}`) || []
      );
      const pairedSewingTargets = sewingTargetsData?.filter(t =>
        sewingActualKeys.has(`${t.line_id}_${t.production_date}`)
      ) || [];

      // Finishing: match TARGET to OUTPUT by work_order_id + production_date
      const finishingOutputKeys = new Set(
        finishingDailyLogs?.map(u => `${(u as any).work_order_id}_${u.production_date}`) || []
      );
      const pairedFinishingTargets = finishingTargetLogs?.filter(t =>
        finishingOutputKeys.has(`${(t as any).work_order_id}_${t.production_date}`)
      ) || [];

      // Process daily data
      const dailyMap = new Map<string, DailyData>();

      const getOrCreateDaily = (date: string) => {
        return dailyMap.get(date) || {
          date,
          displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          sewingOutput: 0,
          sewingTarget: 0,
          finishingQcPass: 0,
          finishingPolyOutput: 0,
          finishingPolyTarget: 0,
          efficiency: 0,
          blockers: 0,
          manpower: 0,
        };
      };

      // Sewing actuals → output, manpower, blockers
      sewingActualsData?.forEach(u => {
        const existing = getOrCreateDaily(u.production_date);
        existing.sewingOutput += u.good_today || 0;
        if (u.has_blocker) existing.blockers += 1;
        existing.manpower += u.manpower_actual || 0;
        dailyMap.set(u.production_date, existing);
      });

      // Sewing targets → daily target (per_hour_target * 8) — only paired with actuals
      pairedSewingTargets.forEach(t => {
        const existing = getOrCreateDaily(t.production_date);
        existing.sewingTarget += (t.per_hour_target || 0) * 8;
        dailyMap.set(t.production_date, existing);
      });

      // Finishing daily logs (OUTPUT) → poly is primary output
      finishingDailyLogs?.forEach(u => {
        const existing = getOrCreateDaily(u.production_date);
        const adjPoly = effectivePoly(u.poly, u.actual_hours, u.ot_hours_actual);
        const adjCarton = effectivePoly(u.carton, u.actual_hours, u.ot_hours_actual);
        existing.finishingQcPass += adjPoly + adjCarton;
        existing.finishingPolyOutput += adjPoly;
        dailyMap.set(u.production_date, existing);
      });

      // Finishing daily logs (TARGET) → poly target (per-hour × planned_hours) — only paired with outputs
      pairedFinishingTargets.forEach(t => {
        const existing = getOrCreateDaily(t.production_date);
        const plannedHrs = t.planned_hours || 0;
        existing.finishingPolyTarget += (t.poly || 0) * (plannedHrs > 0 ? plannedHrs : 1);
        dailyMap.set(t.production_date, existing);
      });

      // Calculate daily efficiency
      const dailyDataArray = Array.from(dailyMap.values()).map(d => ({
        ...d,
        efficiency: d.sewingTarget > 0 ? Math.round((d.sewingOutput / d.sewingTarget) * 100) : 0,
      })).sort((a, b) => a.date.localeCompare(b.date));

      setDailyData(dailyDataArray);

      // Process line performance
      const lineMap = new Map<string, LinePerformance>();

      // From sewing actuals: output, manpower, blockers
      sewingActualsData?.forEach(u => {
        const lineId = u.line_id;
        const lineName = u.lines?.name || u.lines?.line_id || 'Unknown';
        const existing = lineMap.get(lineId) || {
          lineName,
          lineId,
          totalOutput: 0,
          totalTarget: 0,
          efficiency: 0,
          avgManpower: 0,
          submissions: 0,
          blockers: 0,
        };
        existing.totalOutput += u.good_today || 0;
        existing.avgManpower += u.manpower_actual || 0;
        existing.submissions += 1;
        if (u.has_blocker) existing.blockers += 1;
        lineMap.set(lineId, existing);
      });

      // From sewing targets: daily target per line — only paired with actuals
      pairedSewingTargets.forEach(t => {
        const lineId = t.line_id;
        const lineName = t.lines?.name || t.lines?.line_id || 'Unknown';
        const existing = lineMap.get(lineId) || {
          lineName,
          lineId,
          totalOutput: 0,
          totalTarget: 0,
          efficiency: 0,
          avgManpower: 0,
          submissions: 0,
          blockers: 0,
        };
        existing.totalTarget += (t.per_hour_target || 0) * 8;
        lineMap.set(lineId, existing);
      });

      const linePerformanceArray = Array.from(lineMap.values()).map(l => ({
        ...l,
        efficiency: l.totalTarget > 0 ? Math.round((l.totalOutput / l.totalTarget) * 100) : 0,
        avgManpower: l.submissions > 0 ? Math.round(l.avgManpower / l.submissions) : 0,
      })).sort((a, b) => b.efficiency - a.efficiency);

      setLinePerformance(linePerformanceArray);

      // Process blocker breakdown (from sewing actuals)
      const blockerMap = new Map<string, { count: number; impact: string }>();
      const allBlockers = [
        ...(sewingActualsData?.filter(u => u.has_blocker) || []),
      ];

      allBlockers.forEach(b => {
        const typeName = b.blocker_types?.name || 'Other';
        const existing = blockerMap.get(typeName) || { count: 0, impact: b.blocker_impact || 'medium' };
        existing.count += 1;
        blockerMap.set(typeName, existing);
      });

      const blockerBreakdownArray = Array.from(blockerMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.count - a.count);

      setBlockerBreakdown(blockerBreakdownArray);

      // Process work order progress
      const woProgressMap = new Map<string, WorkOrderProgress>();
      workOrders?.forEach(wo => {
        woProgressMap.set(wo.id, {
          poNumber: wo.po_number,
          buyer: wo.buyer,
          style: wo.style,
          orderQty: wo.order_qty,
          totalOutput: 0,
          progress: 0,
          lineName: wo.lines?.name || null,
        });
      });

      sewingActualsData?.forEach(u => {
        if (u.work_order_id && woProgressMap.has(u.work_order_id)) {
          const wo = woProgressMap.get(u.work_order_id)!;
          wo.totalOutput += u.good_today || 0;
          wo.progress = wo.orderQty > 0 ? Math.round((wo.totalOutput / wo.orderQty) * 100) : 0;
        }
      });

      const woProgressArray = Array.from(woProgressMap.values())
        .filter(wo => wo.totalOutput > 0)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 10);

      setWorkOrderProgress(woProgressArray);

      // Calculate summary
      const totalSewingOutput = sewingActualsData?.reduce((sum, u) => sum + (u.good_today || 0), 0) || 0;
      const totalSewingTarget = pairedSewingTargets.reduce((sum, t) => sum + ((t.per_hour_target || 0) * 8), 0) || 0;
      const totalFinishingQcPass = finishingDailyLogs?.reduce((sum, u) => sum + effectivePoly(u.poly, u.actual_hours, u.ot_hours_actual) + effectivePoly(u.carton, u.actual_hours, u.ot_hours_actual), 0) || 0;
      const totalManpower = sewingActualsData?.reduce((sum, u) => sum + (u.manpower_actual || 0), 0) || 0;

      const prevTotalOutput = prevSewingActuals?.reduce((sum, u) => sum + (u.good_today || 0), 0) || 0;
      const prevTotalTarget = prevSewingTargets?.reduce((sum, t) => sum + ((t.per_hour_target || 0) * 8), 0) || 0;
      const prevTotalQcPass = prevFinishingDailyLogs?.reduce((sum, u) => sum + effectivePoly((u as any).poly, (u as any).actual_hours, (u as any).ot_hours_actual) + effectivePoly((u as any).carton, (u as any).actual_hours, (u as any).ot_hours_actual), 0) || 0;
      const prevEfficiency = prevTotalTarget > 0 ? (prevTotalOutput / prevTotalTarget) * 100 : 0;
      const prevTotalBlockers = prevSewingActuals?.filter(u => u.has_blocker).length || 0;
      const prevTotalManpower = prevSewingActuals?.reduce((sum, u) => sum + (u.manpower_actual || 0), 0) || 0;
      const prevDaysWithData = new Set(prevSewingActuals?.map(u => u.production_date) || []).size;

      // Set previous period data for comparison
      setPreviousPeriodData({
        totalOutput: prevTotalOutput,
        totalQcPass: prevTotalQcPass,
        avgEfficiency: Math.round(prevEfficiency),
        totalBlockers: prevTotalBlockers,
        avgManpower: prevSewingActuals && prevSewingActuals.length > 0 ? Math.round(prevTotalManpower / prevSewingActuals.length) : 0,
        daysWithData: prevDaysWithData,
      });

      const openBlockers = allBlockers.filter(b => (b as any).blocker_status !== 'resolved').length;
      const resolvedBlockers = allBlockers.filter(b => (b as any).blocker_status === 'resolved').length;

      const avgEfficiency = totalSewingTarget > 0 ? (totalSewingOutput / totalSewingTarget) * 100 : 0;
      
      let efficiencyTrend: 'up' | 'down' | 'stable' = 'stable';
      if (avgEfficiency > prevEfficiency + 5) efficiencyTrend = 'up';
      else if (avgEfficiency < prevEfficiency - 5) efficiencyTrend = 'down';

      let outputTrend: 'up' | 'down' | 'stable' = 'stable';
      if (totalSewingOutput > prevTotalOutput * 1.1) outputTrend = 'up';
      else if (totalSewingOutput < prevTotalOutput * 0.9) outputTrend = 'down';

      setSummary({
        totalSewingOutput,
        totalFinishingQcPass,
        avgDailyOutput: dailyDataArray.length > 0 ? Math.round(totalSewingOutput / dailyDataArray.length) : 0,
        avgDailyQcPass: dailyDataArray.length > 0 ? Math.round(totalFinishingQcPass / dailyDataArray.length) : 0,
        avgEfficiency: Math.round(avgEfficiency),
        totalBlockers: allBlockers.length,
        openBlockers,
        resolvedBlockers,
        avgManpower: sewingActualsData && sewingActualsData.length > 0 ? Math.round(totalManpower / sewingActualsData.length) : 0,
        daysWithData: dailyDataArray.length,
        topPerformingLine: linePerformanceArray[0]?.lineName || null,
        worstPerformingLine: linePerformanceArray[linePerformanceArray.length - 1]?.lineName || null,
        mostCommonBlockerType: blockerBreakdownArray[0]?.type || null,
        efficiencyTrend,
        outputTrend,
        previousPeriodEfficiency: Math.round(prevEfficiency),
        previousPeriodOutput: prevTotalOutput,
      });

      // ── Financial calculations ──
      const rate = costConfigured && headcountCost.value ? headcountCost.value : 0;
      const costCurrency = headcountCost.currency;
      const toUsd = (v: number) => costCurrency === 'BDT' && bdtToUsd ? v * bdtToUsd : v;

      // Revenue: sewing output × (cm_per_dozen / 12) — already in USD
      const revenueByPoMap: Record<string, { po: string; buyer: string; revenue: number; output: number; cmDz: number }> = {};
      let totalRevenue = 0;
      sewingActualsData?.forEach(u => {
        const cm = (u as any).work_orders?.cm_per_dozen;
        const output = u.good_today || 0;
        if (cm && output) {
          const rev = (cm / 12) * output;
          totalRevenue += rev;
          const po = (u as any).work_orders?.po_number || 'Unknown';
          if (!revenueByPoMap[po]) revenueByPoMap[po] = { po, buyer: (u as any).work_orders?.buyer || '', revenue: 0, output: 0, cmDz: cm };
          revenueByPoMap[po].revenue += rev;
          revenueByPoMap[po].output += output;
        }
      });

      // Cost by department (native currency, then convert to USD)
      let sewCost = 0, cutCost = 0, finCost = 0;
      const costByPoMap: Record<string, { sewing: number; cutting: number; finishing: number }> = {};
      const addPoCost = (po: string, dept: 'sewing' | 'cutting' | 'finishing', amount: number) => {
        if (!costByPoMap[po]) costByPoMap[po] = { sewing: 0, cutting: 0, finishing: 0 };
        costByPoMap[po][dept] += amount;
      };

      if (rate > 0) {
        sewingActualsData?.forEach(s => {
          if (!(s as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (s.manpower_actual && s.hours_actual) c += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) c += rate * s.ot_manpower_actual * s.ot_hours_actual;
          sewCost += c;
          if (c > 0) addPoCost((s as any).work_orders?.po_number || 'Unknown', 'sewing', c);
        });

        cuttingActualsData?.forEach(c => {
          if (!(c as any).work_orders?.cm_per_dozen) return;
          let cost = 0;
          if (c.man_power && c.hours_actual) cost += rate * c.man_power * c.hours_actual;
          if (c.ot_manpower_actual && c.ot_hours_actual) cost += rate * c.ot_manpower_actual * c.ot_hours_actual;
          cutCost += cost;
          if (cost > 0) addPoCost((c as any).work_orders?.po_number || 'Unknown', 'cutting', cost);
        });

        finishingDailyLogs?.forEach(log => {
          if (!(log as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (log.m_power_actual && log.actual_hours) c += rate * log.m_power_actual * log.actual_hours;
          if (log.ot_manpower_actual && log.ot_hours_actual) c += rate * log.ot_manpower_actual * log.ot_hours_actual;
          finCost += c;
          if (c > 0) addPoCost((log as any).work_orders?.po_number || 'Unknown', 'finishing', c);
        });
      }

      const totalCostUsd = toUsd(sewCost + cutCost + finCost);
      const sewingCostUsd = toUsd(sewCost);
      const cuttingCostUsd = toUsd(cutCost);
      const finishingCostUsd = toUsd(finCost);
      const profit = totalRevenue - totalCostUsd;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      // Revenue by PO
      const revenueByPo = Object.values(revenueByPoMap).sort((a, b) => b.revenue - a.revenue);

      // Profit by PO (merge revenue + cost)
      const allPos = new Set([...Object.keys(revenueByPoMap), ...Object.keys(costByPoMap)]);
      const profitByPo = Array.from(allPos).map(po => {
        const rev = revenueByPoMap[po]?.revenue || 0;
        const costNative = costByPoMap[po] ? (costByPoMap[po].sewing + costByPoMap[po].cutting + costByPoMap[po].finishing) : 0;
        const costUsd = toUsd(costNative);
        const poProfit = rev - costUsd;
        return {
          po,
          buyer: revenueByPoMap[po]?.buyer || '',
          revenue: Math.round(rev * 100) / 100,
          cost: Math.round(costUsd * 100) / 100,
          profit: Math.round(poProfit * 100) / 100,
          margin: rev > 0 ? Math.round((poProfit / rev) * 1000) / 10 : 0,
        };
      }).filter(p => p.revenue > 0 || p.cost > 0).sort((a, b) => b.profit - a.profit);

      // Daily financials (revenue + cost per day)
      const dailyRevMap: Record<string, number> = {};
      const dailyCostMap: Record<string, number> = {};
      finishingDailyLogs?.forEach(log => {
        const cm = (log as any).work_orders?.cm_per_dozen;
        const output = log.poly || 0;
        if (cm && output) {
          dailyRevMap[log.production_date] = (dailyRevMap[log.production_date] || 0) + (cm / 12) * output;
        }
      });
      if (rate > 0) {
        sewingActualsData?.forEach(s => {
          if (!(s as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (s.manpower_actual && s.hours_actual) c += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) c += rate * s.ot_manpower_actual * s.ot_hours_actual;
          dailyCostMap[s.production_date] = (dailyCostMap[s.production_date] || 0) + c;
        });
        cuttingActualsData?.forEach(c => {
          if (!(c as any).work_orders?.cm_per_dozen) return;
          let cost = 0;
          if (c.man_power && c.hours_actual) cost += rate * c.man_power * c.hours_actual;
          if (c.ot_manpower_actual && c.ot_hours_actual) cost += rate * c.ot_manpower_actual * c.ot_hours_actual;
          dailyCostMap[c.production_date] = (dailyCostMap[c.production_date] || 0) + cost;
        });
        finishingDailyLogs?.forEach(log => {
          if (!(log as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (log.m_power_actual && log.actual_hours) c += rate * log.m_power_actual * log.actual_hours;
          if (log.ot_manpower_actual && log.ot_hours_actual) c += rate * log.ot_manpower_actual * log.ot_hours_actual;
          dailyCostMap[log.production_date] = (dailyCostMap[log.production_date] || 0) + c;
        });
      }

      const allDates = new Set([...Object.keys(dailyRevMap), ...Object.keys(dailyCostMap)]);
      const dailyFinancials = Array.from(allDates).sort().map(date => {
        const rev = dailyRevMap[date] || 0;
        const costNative = dailyCostMap[date] || 0;
        const costUsdDay = toUsd(costNative);
        return {
          date,
          displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: Math.round(rev * 100) / 100,
          cost: Math.round(costUsdDay * 100) / 100,
          profit: Math.round((rev - costUsdDay) * 100) / 100,
        };
      });

      // Previous period financials
      let prevRevenue = 0;
      prevFinishingOutputLogs?.forEach(log => {
        const cm = (log as any).work_orders?.cm_per_dozen;
        const output = (log as any).poly || 0;
        if (cm && output) prevRevenue += (cm / 12) * output;
      });
      let prevCostNative = 0;
      if (rate > 0) {
        prevSewingActuals?.forEach(s => {
          if (s.manpower_actual && (s as any).hours_actual) prevCostNative += rate * s.manpower_actual * (s as any).hours_actual;
        });
        prevCuttingActuals?.forEach(c => {
          if ((c as any).man_power && (c as any).hours_actual) prevCostNative += rate * (c as any).man_power * (c as any).hours_actual;
        });
        prevFinishingOutputLogs?.forEach(log => {
          if ((log as any).m_power_actual && (log as any).actual_hours) prevCostNative += rate * (log as any).m_power_actual * (log as any).actual_hours;
        });
      }
      const prevCostUsd = toUsd(prevCostNative);
      const prevProfit = prevRevenue - prevCostUsd;
      const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

      // Cost & revenue per piece
      const totalFinishingPoly = finishingDailyLogs?.reduce((sum, u) => sum + effectivePoly(u.poly, u.actual_hours, u.ot_hours_actual), 0) || 0;

      setFinancialData({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCostUsd * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: Math.round(margin * 10) / 10,
        sewingCost: Math.round(sewingCostUsd * 100) / 100,
        cuttingCost: Math.round(cuttingCostUsd * 100) / 100,
        finishingCost: Math.round(finishingCostUsd * 100) / 100,
        revenueByPo,
        profitByPo,
        dailyFinancials,
        costPerPiece: totalFinishingPoly > 0 ? Math.round((totalCostUsd / totalFinishingPoly) * 100) / 100 : 0,
        revenuePerPiece: totalFinishingPoly > 0 ? Math.round((totalRevenue / totalFinishingPoly) * 100) / 100 : 0,
        prevRevenue: Math.round(prevRevenue * 100) / 100,
        prevCost: Math.round(prevCostUsd * 100) / 100,
        prevProfit: Math.round(prevProfit * 100) / 100,
        prevMargin: Math.round(prevMargin * 10) / 10,
        hasData: totalRevenue > 0 || (sewCost + cutCost + finCost) > 0,
      });

    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  }

  // Premium chart colors with better visual hierarchy
  const CHART_COLORS = [
    '#1e40af', // Deep blue
    '#7c3aed', // Vibrant violet  
    '#0891b2', // Cyan
    '#059669', // Emerald
    '#d97706', // Amber
    '#dc2626', // Red
  ];

  // State for active pie segment hover
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);
  const [activeCostPieIndex, setActiveCostPieIndex] = useState<number | undefined>(undefined);

  // 3D-like active shape renderer for pie chart
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
    
    return (
      <g>
        {/* Outer glow effect */}
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 4}
          outerRadius={outerRadius + 12}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          opacity={0.2}
          style={{ filter: 'blur(8px)' }}
        />
        {/* Main elevated segment */}
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 2}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          stroke="hsl(var(--card))"
          strokeWidth={3}
          style={{ 
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.25))',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
        {/* Inner highlight ring */}
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 2}
          outerRadius={innerRadius + 2}
          startAngle={startAngle}
          endAngle={endAngle}
          fill="rgba(255,255,255,0.3)"
        />
        {/* Center text - truncated to fit */}
        <text 
          x={cx} 
          y={cy - 6} 
          textAnchor="middle" 
          fill="hsl(var(--foreground))" 
          fontSize={11}
          fontWeight={600}
        >
          {payload.type.length > 12 ? `${payload.type.slice(0, 10)}...` : payload.type}
        </text>
        <text 
          x={cx} 
          y={cy + 12} 
          textAnchor="middle" 
          fill="hsl(var(--muted-foreground))" 
          fontSize={14}
          fontWeight={700}
        >
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      </g>
    );
  };

  const renderCostActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={outerRadius + 12} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.2} style={{ filter: 'blur(8px)' }} />
        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} stroke="hsl(var(--card))" strokeWidth={3} style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.25))', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={innerRadius + 2} startAngle={startAngle} endAngle={endAngle} fill="rgba(255,255,255,0.3)" />
        <text x={cx} y={cy - 14} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={11} fontWeight={600}>
          {payload.name}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={13} fontWeight={700}>
          ${value.toLocaleString()}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11} fontWeight={600}>
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      </g>
    );
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <ArrowUp className="h-4 w-4 text-success" />;
    if (trend === 'down') return <ArrowDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const handleLineDrillDown = (lineId: string, lineName: string) => {
    setSelectedLineId(lineId);
    setSelectedLineName(lineName);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-4 md:space-y-6 overflow-x-hidden">
      {/* Line Drill-Down Modal */}
      {selectedLineId && profile?.factory_id && (
        <LineDrillDown
          lineId={selectedLineId}
          lineName={selectedLineName}
          factoryId={profile.factory_id}
          startDate={dateRange.start}
          endDate={dateRange.end}
          onClose={() => {
            setSelectedLineId(null);
            setSelectedLineName(null);
          }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Production Insights
          </h1>
          <p className="text-muted-foreground">Deep-dive analytics and performance trends</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as '7' | '14' | '21' | '30')}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="21">Last 21 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <InsightsReportDialog />
          <ReportExportDialog />
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <SewingMachine className="h-4 w-4" />
              Total Sewing Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className="text-2xl md:text-3xl font-bold font-mono">{summary.totalSewingOutput.toLocaleString()}</p>
              <TrendIcon trend={summary.outputTrend} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.avgDailyOutput.toLocaleString()} avg/day
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-info/5 rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Total Finishing Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl md:text-3xl font-bold font-mono">{summary.totalFinishingQcPass.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.avgDailyQcPass.toLocaleString()} avg/day
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-success/5 rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Avg Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className={`text-2xl md:text-3xl font-bold ${summary.avgEfficiency >= 90 ? 'text-success' : summary.avgEfficiency >= 70 ? 'text-warning' : 'text-destructive'}`}>
                {summary.avgEfficiency}%
              </p>
              <TrendIcon trend={summary.efficiencyTrend} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              vs {summary.previousPeriodEfficiency}% prev period
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-warning/5 rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl md:text-3xl font-bold">{summary.totalBlockers}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px] md:text-xs bg-warning/10 text-warning border-warning/30">
                {summary.openBlockers} open
              </Badge>
              <Badge variant="outline" className="text-[10px] md:text-xs bg-success/10 text-success border-success/30">
                {summary.resolvedBlockers} resolved
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Period Comparison */}
      <PeriodComparison
        currentPeriod={{
          totalOutput: summary.totalSewingOutput,
          totalQcPass: summary.totalFinishingQcPass,
          avgEfficiency: summary.avgEfficiency,
          totalBlockers: summary.totalBlockers,
          avgManpower: summary.avgManpower,
          daysWithData: summary.daysWithData,
        }}
        previousPeriod={previousPeriodData}
        periodDays={parseInt(period)}
      />

      {/* Trends Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Trends
        </h2>

        {/* Sewing Output Trend Chart */}
        <Card className="w-full overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SewingMachine className="h-5 w-5 text-primary" />
              Sewing Output vs Target
            </CardTitle>
            <CardDescription>Daily sewing output compared to target over time</CardDescription>
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            <InteractiveChart
              data={dailyData}
              height={300}
              activePeriod={parseInt(period)}
              onPeriodChange={(days) => setPeriod(String(days) as '7' | '14' | '30')}
              yDomain={[sewingYMin, effectiveSewingYMax]}
              onYDomainChange={([min, max]) => { setSewingYMin(min); setSewingYMax(max); }}
              onYReset={() => { setSewingYMin(0); setSewingYMax('auto'); }}
              isYCustom={sewingYMax !== 'auto' || sewingYMin !== 0}
              emptyMessage="No sewing data available for this period"
            >
              <defs>
                <linearGradient id="colorSewingOutput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSewingTarget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
              <YAxis domain={[sewingYMin, effectiveSewingYMax]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={45} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '8px' }} />
              <Area type="monotone" dataKey="sewingTarget" name="Target" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSewingTarget)" strokeWidth={2} strokeDasharray="5 5" />
              <Area type="monotone" dataKey="sewingOutput" name="Output" stroke="#22c55e" fillOpacity={1} fill="url(#colorSewingOutput)" strokeWidth={2} />
            </InteractiveChart>
          </CardContent>
        </Card>

        {/* Finishing Poly Trend Chart */}
        <Card className="w-full overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5 text-violet-600" />
              Finishing Poly Output vs Target
            </CardTitle>
            <CardDescription>Daily finishing poly output compared to target over time</CardDescription>
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            {dailyData.some(d => d.finishingPolyOutput > 0 || d.finishingPolyTarget > 0) ? (
              <InteractiveChart
                data={dailyData}
                height={300}
                activePeriod={parseInt(period)}
                onPeriodChange={(days) => setPeriod(String(days) as '7' | '14' | '30')}
                yDomain={[finishingYMin, effectiveFinishingYMax]}
                onYDomainChange={([min, max]) => { setFinishingYMin(min); setFinishingYMax(max); }}
                onYReset={() => { setFinishingYMin(0); setFinishingYMax('auto'); }}
                isYCustom={finishingYMax !== 'auto' || finishingYMin !== 0}
                emptyMessage="No finishing poly data in selected range"
              >
                <defs>
                  <linearGradient id="colorFinPolyOutput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFinPolyTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <YAxis domain={[finishingYMin, effectiveFinishingYMax]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={45} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '8px' }} />
                <Area type="monotone" dataKey="finishingPolyTarget" name="Poly Target" stroke="#7c3aed" fillOpacity={1} fill="url(#colorFinPolyTarget)" strokeWidth={2} strokeDasharray="5 5" />
                <Area type="monotone" dataKey="finishingPolyOutput" name="Poly Output" stroke="#22c55e" fillOpacity={1} fill="url(#colorFinPolyOutput)" strokeWidth={2} />
              </InteractiveChart>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No finishing poly data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Efficiency Trend */}
          <Card className="w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-5 w-5 text-warning" />
                Daily Efficiency %
              </CardTitle>
              <CardDescription>Target achievement rate by day</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              {dailyData.length > 0 ? (
                <div className="w-full overflow-hidden">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis domain={[0, 150]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={30} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Bar 
                        dataKey="efficiency" 
                        name="Efficiency %" 
                        radius={[4, 4, 0, 0]}
                        fill="hsl(var(--primary))"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </CardContent>
          </Card>

          {/* Finishing vs Sewing Comparison */}
          <Card className="w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-info" />
                Sewing Output vs Finishing QC Pass
              </CardTitle>
              <CardDescription>Daily comparison of production stages</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              {dailyData.length > 0 ? (
                <div className="w-full overflow-hidden">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={35} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Legend wrapperStyle={{ paddingTop: '8px' }} />
                      <Bar dataKey="sewingOutput" name="Sewing" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="finishingQcPass" name="Finishing QC" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lines Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <SewingMachine className="h-5 w-5 text-primary" />
          Line Performance
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Line Efficiency Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Line Performance Ranking
              </CardTitle>
              <CardDescription>Click on a line to see daily breakdown</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linePerformance.length > 0 ? linePerformance.map((line, idx) => (
                <div 
                  key={line.lineId} 
                  className="space-y-2 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border border-transparent hover:border-border"
                  onClick={() => handleLineDrillDown(line.lineId, line.lineName)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-success/20 text-success' : 
                        idx === linePerformance.length - 1 ? 'bg-destructive/20 text-destructive' : 
                        'bg-muted text-muted-foreground'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="font-medium">{line.lineName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {line.totalOutput.toLocaleString()} pcs
                      </span>
                      <Badge variant={line.efficiency >= 90 ? 'default' : line.efficiency >= 70 ? 'secondary' : 'destructive'}>
                        {line.efficiency}%
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <Progress value={Math.min(line.efficiency, 100)} className="h-2" />
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">
                  No line data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Output Chart */}
          <Card className="w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Output by Line
              </CardTitle>
              <CardDescription>Total output comparison</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              {linePerformance.length > 0 ? (
                <div className="w-full overflow-hidden">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={linePerformance} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis dataKey="lineName" type="category" width={40} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Bar 
                        dataKey="totalOutput" 
                        name="Output" 
                        fill="hsl(var(--primary))" 
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(data) => handleLineDrillDown(data.lineId, data.lineName)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No line data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Line Stats Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detailed Line Statistics</CardTitle>
            <CardDescription>Click on a row for daily breakdown</CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs md:text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 md:py-3 px-2 font-medium">Line</th>
                    <th className="text-right py-2 md:py-3 px-2 font-medium">Output</th>
                    <th className="text-right py-2 md:py-3 px-2 font-medium hidden sm:table-cell">Target</th>
                    <th className="text-right py-2 md:py-3 px-2 font-medium">Eff.</th>
                    <th className="text-right py-2 md:py-3 px-2 font-medium hidden md:table-cell">MP</th>
                    <th className="text-right py-2 md:py-3 px-2 font-medium hidden sm:table-cell">Blockers</th>
                    <th className="text-right py-2 md:py-3 px-2 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {linePerformance.map(line => (
                    <tr 
                      key={line.lineId} 
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleLineDrillDown(line.lineId, line.lineName)}
                    >
                      <td className="py-2 md:py-3 px-2 font-medium">{line.lineName}</td>
                      <td className="py-2 md:py-3 px-2 text-right font-mono">{line.totalOutput.toLocaleString()}</td>
                      <td className="py-2 md:py-3 px-2 text-right font-mono text-muted-foreground hidden sm:table-cell">{line.totalTarget.toLocaleString()}</td>
                      <td className="py-2 md:py-3 px-2 text-right">
                        <Badge variant={line.efficiency >= 90 ? 'default' : line.efficiency >= 70 ? 'secondary' : 'destructive'} className="text-[10px] md:text-xs">
                          {line.efficiency}%
                        </Badge>
                      </td>
                      <td className="py-2 md:py-3 px-2 text-right hidden md:table-cell">{line.avgManpower}</td>
                      <td className="py-2 md:py-3 px-2 text-right hidden sm:table-cell">
                        {line.blockers > 0 ? (
                          <Badge variant="destructive" className="text-[10px] md:text-xs">{line.blockers}</Badge>
                        ) : (
                          <span className="text-success">0</span>
                        )}
                      </td>
                      <td className="py-2 md:py-3 px-2 text-right">
                        <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blockers Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Blockers Analysis
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Blocker Type Distribution - Premium 3D Design */}
          <Card className="w-full overflow-hidden bg-gradient-to-br from-card via-card to-muted/20 shadow-xl border-border/40 hover:shadow-2xl transition-shadow duration-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold tracking-tight">
                Blocker Type Distribution
              </CardTitle>
              <CardDescription className="text-muted-foreground/80">
                Hover over segments for details
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {blockerBreakdown.length > 0 ? (
                <div className="w-full flex flex-col items-center">
                  <div className="relative">
                    {/* Ambient glow behind chart */}
                    <div 
                      className="absolute inset-0 rounded-full opacity-30 blur-3xl pointer-events-none"
                      style={{
                        background: `radial-gradient(circle, ${CHART_COLORS[0]}40 0%, transparent 70%)`,
                        transform: 'scale(0.8)'
                      }}
                    />
                    <ResponsiveContainer width={300} height={260}>
                      <PieChart>
                        <defs>
                          {CHART_COLORS.map((color, idx) => (
                            <linearGradient key={idx} id={`blockerGradient3d${idx}`} x1="0" y1="0" x2="0.5" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity={1} />
                              <stop offset="50%" stopColor={color} stopOpacity={0.9} />
                              <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                            </linearGradient>
                          ))}
                          {/* 3D depth shadow filter */}
                          <filter id="pie3dShadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.25" />
                          </filter>
                          {/* Inner shadow for depth */}
                          <filter id="pieInnerShadow">
                            <feOffset dx="0" dy="2" />
                            <feGaussianBlur stdDeviation="2" result="offset-blur" />
                            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
                            <feFlood floodColor="black" floodOpacity="0.15" result="color" />
                            <feComposite operator="in" in="color" in2="inverse" result="shadow" />
                            <feComposite operator="over" in="shadow" in2="SourceGraphic" />
                          </filter>
                        </defs>
                        <Pie
                          data={blockerBreakdown}
                          dataKey="count"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          innerRadius={55}
                          paddingAngle={4}
                          cornerRadius={6}
                          activeIndex={activePieIndex}
                          activeShape={renderActiveShape}
                          onMouseEnter={(_, index) => setActivePieIndex(index)}
                          onMouseLeave={() => setActivePieIndex(undefined)}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                          style={{ 
                            filter: 'url(#pie3dShadow)',
                            cursor: 'pointer'
                          }}
                        >
                          {blockerBreakdown.map((_, idx) => (
                            <Cell 
                              key={idx} 
                              fill={`url(#blockerGradient3d${idx % CHART_COLORS.length})`}
                              style={{
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transformOrigin: 'center'
                              }}
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '12px',
                            boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.25)',
                            padding: '14px 18px',
                            backdropFilter: 'blur(8px)'
                          }}
                          itemStyle={{
                            color: 'hsl(var(--foreground))',
                            fontWeight: 600
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Interactive Legend */}
                  <div className="flex flex-wrap justify-center gap-3 mt-6">
                    {blockerBreakdown.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 cursor-pointer
                          ${activePieIndex === idx 
                            ? 'bg-primary/10 scale-105 shadow-md' 
                            : 'bg-muted/50 hover:bg-muted'
                          }`}
                        onMouseEnter={() => setActivePieIndex(idx)}
                        onMouseLeave={() => setActivePieIndex(undefined)}
                      >
                        <div 
                          className={`w-3 h-3 rounded-full transition-transform duration-300 ${activePieIndex === idx ? 'scale-125' : ''}`}
                          style={{ 
                            backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                            boxShadow: activePieIndex === idx 
                              ? `0 0 12px ${CHART_COLORS[idx % CHART_COLORS.length]}80` 
                              : 'none'
                          }}
                        />
                        <span className={`text-sm transition-colors duration-300 ${activePieIndex === idx ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          {item.type}
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center mb-4 shadow-lg">
                    <CheckCircle2 className="h-10 w-10 text-success" />
                  </div>
                  <p className="font-semibold text-lg">No blockers!</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Great job keeping production flowing</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blocker Summary Cards */}
          <div className="space-y-4">
            <Card className="border-success/30 bg-success/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-success">{summary.resolvedBlockers}</p>
                    <p className="text-sm text-muted-foreground">Blockers Resolved</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-warning" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-warning">{summary.openBlockers}</p>
                    <p className="text-sm text-muted-foreground">Still Open</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {summary.mostCommonBlockerType && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                      <XCircle className="h-6 w-6 text-destructive" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-destructive">{summary.mostCommonBlockerType}</p>
                      <p className="text-sm text-muted-foreground">Most Common Issue</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Blocker List */}
        {blockerBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Blocker Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {blockerBreakdown.map((blocker, idx) => (
                  <div key={blocker.type} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="font-medium">{blocker.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{blocker.count} occurrences</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Work Orders Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Work Order Progress
        </h2>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Orders and Completion Status</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrderProgress.length > 0 ? (
              <div className="space-y-4">
                {workOrderProgress.map(wo => (
                  <div key={wo.poNumber} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{wo.poNumber}</p>
                        <p className="text-sm text-muted-foreground">{wo.buyer} • {wo.style}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold">{wo.totalOutput.toLocaleString()} / {wo.orderQty.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{wo.lineName || 'Unassigned'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(wo.progress, 100)} className="h-2 flex-1" />
                      <span className={`text-sm font-medium ${wo.progress >= 100 ? 'text-success' : wo.progress >= 50 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {wo.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No work order progress data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Financial Insights Section ── */}
      {financialData.hasData && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            Financial Insights
          </h2>

          {/* Financial KPI Cards */}
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <p className="text-2xl md:text-3xl font-bold font-mono text-emerald-600">
                    ${financialData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  {financialData.prevRevenue > 0 && (
                    financialData.totalRevenue > financialData.prevRevenue
                      ? <ArrowUp className="h-4 w-4 text-success" />
                      : financialData.totalRevenue < financialData.prevRevenue
                      ? <ArrowDown className="h-4 w-4 text-destructive" />
                      : <Minus className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${financialData.revenuePerPiece.toFixed(2)} per piece
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/5 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Total Cost
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl md:text-3xl font-bold font-mono text-orange-600">
                  ${financialData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ${financialData.costPerPiece.toFixed(2)} per piece
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <PiggyBank className="h-4 w-4" />
                  Profit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <p className={`text-2xl md:text-3xl font-bold font-mono ${financialData.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {financialData.profit < 0 ? '-' : ''}${Math.abs(financialData.profit).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  {financialData.prevProfit !== 0 && (
                    financialData.profit > financialData.prevProfit
                      ? <ArrowUp className="h-4 w-4 text-success" />
                      : financialData.profit < financialData.prevProfit
                      ? <ArrowDown className="h-4 w-4 text-destructive" />
                      : <Minus className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  vs ${financialData.prevProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} prev period
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Profit Margin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl md:text-3xl font-bold ${financialData.margin >= 20 ? 'text-success' : financialData.margin >= 0 ? 'text-warning' : 'text-destructive'}`}>
                  {financialData.margin.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  vs {financialData.prevMargin.toFixed(1)}% prev period
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue vs Cost Trend */}
          <Card className="w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                Revenue vs Cost Trend
              </CardTitle>
              <CardDescription>Daily revenue, cost, and profit over time (USD)</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              {financialData.dailyFinancials.length > 0 ? (
                <div className="w-full overflow-hidden">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={financialData.dailyFinancials}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCostArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={55} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value: number, name: string) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, name]}
                      />
                      <Legend wrapperStyle={{ paddingTop: '8px' }} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                      <Area type="monotone" dataKey="cost" name="Cost" stroke="#f97316" fillOpacity={1} fill="url(#colorCostArea)" strokeWidth={2} />
                      <Line type="monotone" dataKey="profit" name="Profit" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No financial data available for this period
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cost Breakdown by Department */}
            <Card className="w-full overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-orange-600" />
                  Cost by Department
                </CardTitle>
                <CardDescription>Labor cost distribution (USD)</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {(() => {
                  const COST_COLORS = ['#1e40af', '#d97706', '#7c3aed'];
                  const costPieData = [
                    { name: 'Sewing', value: financialData.sewingCost },
                    { name: 'Cutting', value: financialData.cuttingCost },
                    { name: 'Finishing', value: financialData.finishingCost },
                  ].filter(d => d.value > 0);
                  return costPieData.length > 0 ? (
                    <div className="w-full flex flex-col items-center">
                      <div className="relative">
                        <div
                          className="absolute inset-0 rounded-full opacity-30 blur-3xl pointer-events-none"
                          style={{
                            background: `radial-gradient(circle, ${COST_COLORS[0]}40 0%, transparent 70%)`,
                            transform: 'scale(0.8)'
                          }}
                        />
                        <ResponsiveContainer width={300} height={260}>
                          <PieChart>
                            <defs>
                              {COST_COLORS.map((color, idx) => (
                                <linearGradient key={idx} id={`costGradient3d${idx}`} x1="0" y1="0" x2="0.5" y2="1">
                                  <stop offset="0%" stopColor={color} stopOpacity={1} />
                                  <stop offset="50%" stopColor={color} stopOpacity={0.9} />
                                  <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                                </linearGradient>
                              ))}
                              <filter id="costPie3dShadow" x="-50%" y="-50%" width="200%" height="200%">
                                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.25" />
                              </filter>
                            </defs>
                            <Pie
                              data={costPieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              innerRadius={55}
                              paddingAngle={4}
                              cornerRadius={6}
                              activeIndex={activeCostPieIndex}
                              activeShape={renderCostActiveShape}
                              onMouseEnter={(_, index) => setActiveCostPieIndex(index)}
                              onMouseLeave={() => setActiveCostPieIndex(undefined)}
                              stroke="hsl(var(--card))"
                              strokeWidth={2}
                              style={{ filter: 'url(#costPie3dShadow)', cursor: 'pointer' }}
                            >
                              {costPieData.map((_, idx) => (
                                <Cell
                                  key={idx}
                                  fill={`url(#costGradient3d${idx % COST_COLORS.length})`}
                                  style={{
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    transformOrigin: 'center'
                                  }}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.25)',
                                padding: '14px 18px',
                                backdropFilter: 'blur(8px)'
                              }}
                              itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                              formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3 mt-4">
                        {costPieData.map((d, idx) => (
                          <div
                            key={d.name}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 cursor-pointer
                              ${activeCostPieIndex === idx
                                ? 'bg-primary/10 scale-105 shadow-md'
                                : 'bg-muted/50 hover:bg-muted'
                              }`}
                            onMouseEnter={() => setActiveCostPieIndex(idx)}
                            onMouseLeave={() => setActiveCostPieIndex(undefined)}
                          >
                            <div
                              className={`w-3 h-3 rounded-full transition-transform duration-300 ${activeCostPieIndex === idx ? 'scale-125' : ''}`}
                              style={{
                                backgroundColor: COST_COLORS[idx % COST_COLORS.length],
                                boxShadow: activeCostPieIndex === idx
                                  ? `0 0 12px ${COST_COLORS[idx % COST_COLORS.length]}80`
                                  : 'none'
                              }}
                            />
                            <span className={`text-sm transition-colors duration-300 ${activeCostPieIndex === idx ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                              {d.name}
                            </span>
                            <span className="text-sm font-bold text-foreground">
                              ${d.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[260px] flex items-center justify-center text-muted-foreground">
                      No cost data — configure headcount cost in Settings
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Revenue by PO */}
            <Card className="w-full overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  Revenue by PO
                </CardTitle>
                <CardDescription>Top POs by revenue (USD)</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-6">
                {financialData.revenueByPo.length > 0 ? (
                  <div className="w-full overflow-hidden">
                    <ResponsiveContainer width="100%" height={Math.max(200, financialData.revenueByPo.slice(0, 8).length * 36)}>
                      <BarChart data={financialData.revenueByPo.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                        <YAxis dataKey="po" type="category" width={80} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No revenue data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Profitability by PO Table */}
          {financialData.profitByPo.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-blue-600" />
                  Profitability by PO
                </CardTitle>
                <CardDescription>Revenue, cost, profit, and margin per purchase order (USD)</CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-xs md:text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 md:py-3 px-2 font-medium">PO</th>
                        <th className="text-left py-2 md:py-3 px-2 font-medium hidden sm:table-cell">Buyer</th>
                        <th className="text-right py-2 md:py-3 px-2 font-medium">Revenue</th>
                        <th className="text-right py-2 md:py-3 px-2 font-medium">Cost</th>
                        <th className="text-right py-2 md:py-3 px-2 font-medium">Profit</th>
                        <th className="text-right py-2 md:py-3 px-2 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financialData.profitByPo.map(po => (
                        <tr key={po.po} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="py-2 md:py-3 px-2 font-medium">{po.po}</td>
                          <td className="py-2 md:py-3 px-2 text-muted-foreground hidden sm:table-cell">{po.buyer}</td>
                          <td className="py-2 md:py-3 px-2 text-right font-mono text-emerald-600">${po.revenue.toLocaleString()}</td>
                          <td className="py-2 md:py-3 px-2 text-right font-mono text-orange-600">${po.cost.toLocaleString()}</td>
                          <td className={`py-2 md:py-3 px-2 text-right font-mono font-bold ${po.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {po.profit < 0 ? '-' : ''}${Math.abs(po.profit).toLocaleString()}
                          </td>
                          <td className="py-2 md:py-3 px-2 text-right">
                            <Badge variant={po.margin >= 20 ? 'default' : po.margin >= 0 ? 'secondary' : 'destructive'} className="text-[10px] md:text-xs">
                              {po.margin.toFixed(1)}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="py-2 md:py-3 px-2" colSpan={2}>Total</td>
                        <td className="py-2 md:py-3 px-2 text-right font-mono text-emerald-600">${financialData.totalRevenue.toLocaleString()}</td>
                        <td className="py-2 md:py-3 px-2 text-right font-mono text-orange-600">${financialData.totalCost.toLocaleString()}</td>
                        <td className={`py-2 md:py-3 px-2 text-right font-mono ${financialData.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {financialData.profit < 0 ? '-' : ''}${Math.abs(financialData.profit).toLocaleString()}
                        </td>
                        <td className="py-2 md:py-3 px-2 text-right">
                          <Badge variant={financialData.margin >= 20 ? 'default' : financialData.margin >= 0 ? 'secondary' : 'destructive'}>
                            {financialData.margin.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financial Key Takeaways */}
          <Card className="bg-gradient-to-br from-emerald-500/5 via-transparent to-violet-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-600" />
                Financial Takeaways
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {/* Best performing PO */}
              {financialData.profitByPo.length > 0 && financialData.profitByPo[0].profit > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10">
                  <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="font-medium text-success">Most Profitable PO</p>
                    <p className="text-sm text-muted-foreground">
                      {financialData.profitByPo[0].po} — ${financialData.profitByPo[0].profit.toLocaleString()} profit ({financialData.profitByPo[0].margin.toFixed(1)}% margin)
                    </p>
                  </div>
                </div>
              )}

              {/* Lowest margin PO */}
              {financialData.profitByPo.length > 1 && (() => {
                const worst = [...financialData.profitByPo].sort((a, b) => a.margin - b.margin)[0];
                return worst.margin < 15 ? (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10">
                    <div className="h-8 w-8 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <p className="font-medium text-warning">Low Margin Alert</p>
                      <p className="text-sm text-muted-foreground">
                        {worst.po} has only {worst.margin.toFixed(1)}% margin — review costs
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Margin trend vs previous period */}
              {financialData.prevMargin > 0 && (
                <div className={`flex items-start gap-3 p-3 rounded-lg ${financialData.margin > financialData.prevMargin ? 'bg-success/10' : financialData.margin < financialData.prevMargin ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${financialData.margin > financialData.prevMargin ? 'bg-success/20' : financialData.margin < financialData.prevMargin ? 'bg-destructive/20' : 'bg-muted-foreground/20'}`}>
                    {financialData.margin > financialData.prevMargin
                      ? <ArrowUp className="h-4 w-4 text-success" />
                      : financialData.margin < financialData.prevMargin
                      ? <ArrowDown className="h-4 w-4 text-destructive" />
                      : <Minus className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className={`font-medium ${financialData.margin > financialData.prevMargin ? 'text-success' : financialData.margin < financialData.prevMargin ? 'text-destructive' : 'text-muted-foreground'}`}>
                      Margin {financialData.margin > financialData.prevMargin ? 'Improving' : financialData.margin < financialData.prevMargin ? 'Declining' : 'Stable'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {financialData.margin.toFixed(1)}% vs {financialData.prevMargin.toFixed(1)}% previous period
                    </p>
                  </div>
                </div>
              )}

              {/* Cost per piece insight */}
              {financialData.costPerPiece > 0 && financialData.revenuePerPiece > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-blue-600">Unit Economics</p>
                    <p className="text-sm text-muted-foreground">
                      Revenue ${financialData.revenuePerPiece.toFixed(2)}/pc vs Cost ${financialData.costPerPiece.toFixed(2)}/pc
                    </p>
                  </div>
                </div>
              )}

              {/* Biggest cost driver */}
              {financialData.totalCost > 0 && (() => {
                const depts = [
                  { name: 'Sewing', cost: financialData.sewingCost },
                  { name: 'Cutting', cost: financialData.cuttingCost },
                  { name: 'Finishing', cost: financialData.finishingCost },
                ].sort((a, b) => b.cost - a.cost);
                const top = depts[0];
                const pct = Math.round((top.cost / financialData.totalCost) * 100);
                return (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10">
                    <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                      <Wallet className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-medium text-orange-600">Biggest Cost Driver</p>
                      <p className="text-sm text-muted-foreground">
                        {top.name} accounts for {pct}% of total cost (${top.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Revenue trend */}
              {financialData.prevRevenue > 0 && (
                <div className={`flex items-start gap-3 p-3 rounded-lg ${financialData.totalRevenue > financialData.prevRevenue ? 'bg-success/10' : 'bg-warning/10'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${financialData.totalRevenue > financialData.prevRevenue ? 'bg-success/20' : 'bg-warning/20'}`}>
                    {financialData.totalRevenue > financialData.prevRevenue
                      ? <ArrowUp className="h-4 w-4 text-success" />
                      : <ArrowDown className="h-4 w-4 text-warning" />}
                  </div>
                  <div>
                    <p className={`font-medium ${financialData.totalRevenue > financialData.prevRevenue ? 'text-success' : 'text-warning'}`}>
                      Revenue {financialData.totalRevenue > financialData.prevRevenue ? 'Up' : 'Down'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ${financialData.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs ${financialData.prevRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} prev period
                      ({financialData.prevRevenue > 0 ? `${financialData.totalRevenue > financialData.prevRevenue ? '+' : ''}${Math.round(((financialData.totalRevenue - financialData.prevRevenue) / financialData.prevRevenue) * 100)}%` : ''})
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {headcountCost.currency === 'BDT' && bdtToUsd && (
            <p className="text-xs text-muted-foreground text-center">
              All values in USD. Exchange rate: {(1 / bdtToUsd).toFixed(1)} BDT/USD
            </p>
          )}
        </div>
      )}

      {/* Performance Summary */}
      <Card className="bg-gradient-to-br from-primary/5 via-transparent to-info/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Key Takeaways
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {summary.topPerformingLine && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10">
              <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="font-medium text-success">Top Performer</p>
                <p className="text-sm text-muted-foreground">{summary.topPerformingLine} leads with highest efficiency</p>
              </div>
            </div>
          )}

          {summary.worstPerformingLine && summary.worstPerformingLine !== summary.topPerformingLine && linePerformance.length > 1 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10">
              <div className="h-8 w-8 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                <TrendingDown className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="font-medium text-warning">Needs Attention</p>
                <p className="text-sm text-muted-foreground">{summary.worstPerformingLine} has lowest efficiency this period</p>
              </div>
            </div>
          )}

          {summary.efficiencyTrend === 'up' && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10">
              <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                <ArrowUp className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="font-medium text-success">Improving Trend</p>
                <p className="text-sm text-muted-foreground">Efficiency is up vs previous period</p>
              </div>
            </div>
          )}

          {summary.efficiencyTrend === 'down' && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10">
              <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <ArrowDown className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-destructive">Declining Trend</p>
                <p className="text-sm text-muted-foreground">Efficiency is down vs previous period</p>
              </div>
            </div>
          )}

          {summary.mostCommonBlockerType && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10">
              <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-destructive">Common Issue</p>
                <p className="text-sm text-muted-foreground">"{summary.mostCommonBlockerType}" is the top blocker type</p>
              </div>
            </div>
          )}

          {summary.daysWithData < 5 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
              <div className="h-8 w-8 rounded-full bg-muted-foreground/20 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Limited Data</p>
                <p className="text-sm text-muted-foreground">Only {summary.daysWithData} days of data. Keep submitting for better insights!</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Section - Full width stacked layout */}
      <div className="space-y-6">
        <LineEfficiencyTargets 
          linePerformance={linePerformance.map(l => ({
            lineId: l.lineId,
            lineName: l.lineName,
            efficiency: l.efficiency,
          }))}
        />

      </div>
    </div>
  );
}
