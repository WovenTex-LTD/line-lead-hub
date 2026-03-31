import { useState, useEffect, useMemo, useCallback } from "react";
import { subDays, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone, toISODate, formatShortDate } from "@/lib/date-utils";
import type {
  TimeRange,
  LinePerformanceData,
  POBreakdown,
  DailyTrendPoint,
  LineTrendData,
  LineFilters,
  FactorySummary,
  AnomalyFlag,
  DataState,
} from "./types";

import { compareLineNames, lineNumber } from "@/lib/sort-lines";

function extractLineNumber(lineId: string): number {
  return lineNumber(lineId);
}

function resolveTarget(row: {
  target_total_planned: number | null;
  per_hour_target: number | null;
  hours_planned: number | null;
}): number {
  if (row.target_total_planned != null) return row.target_total_planned;
  const perHour = row.per_hour_target ?? 0;
  const hours = row.hours_planned ?? 8;
  return Math.round(perHour * hours);
}

function detectAnomaly(totalTarget: number, totalOutput: number, achievementPct: number): AnomalyFlag {
  if (totalTarget > 0 && totalOutput === 0) return "no-output";
  if (achievementPct > 0 && achievementPct < 50) return "critically-low";
  if (achievementPct > 150) return "unusually-high";
  return null;
}

export function useLinePerformance() {
  const { profile, factory, isAdminOrHigher } = useAuth();
  const timezone = factory?.timezone || "Asia/Dhaka";

  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const todayStr = getTodayInTimezone(timezone);
    return new Date(todayStr + "T00:00:00");
  });
  const [hasUserPickedDate, setHasUserPickedDate] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const [filters, setFilters] = useState<LineFilters>({
    searchTerm: "",
    unitFilter: null,
    floorFilter: null,
  });

  // Raw data from queries
  const [rawLines, setRawLines] = useState<any[]>([]);
  const [rawTargets, setRawTargets] = useState<any[]>([]);
  const [rawActuals, setRawActuals] = useState<any[]>([]);
  const [rawAssignments, setRawAssignments] = useState<any[]>([]);
  const [rawAvgActuals, setRawAvgActuals] = useState<any[]>([]); // 30-day actuals for daily avg
  const [userLineIds, setUserLineIds] = useState<Set<string>>(new Set());

  // Re-sync selectedDate when factory timezone loads (only if user hasn't manually picked)
  useEffect(() => {
    if (!hasUserPickedDate && factory?.timezone) {
      const todayStr = getTodayInTimezone(factory.timezone);
      setSelectedDate(new Date(todayStr + "T00:00:00"));
    }
  }, [factory?.timezone, hasUserPickedDate]);

  // Wrap setSelectedDate to track user-initiated changes
  const handleDateChange = useCallback((date: Date) => {
    setHasUserPickedDate(true);
    setSelectedDate(date);
  }, []);

  const factoryId = profile?.factory_id;
  const userId = profile?.id;

  // Compute date range
  const dateRange = useMemo(() => {
    const todayStr = getTodayInTimezone(timezone);
    if (timeRange === "daily") {
      const dateStr = toISODate(selectedDate, timezone);
      return { start: dateStr, end: dateStr };
    }
    const days = parseInt(timeRange);
    const start = format(subDays(new Date(todayStr), days - 1), "yyyy-MM-dd");
    return { start, end: todayStr };
  }, [selectedDate, timeRange, timezone]);

  const fetchData = useCallback(async () => {
    if (!factoryId) return;
    setLoading(true);

    try {
      const dateFilter = timeRange === "daily"
        ? { eq: dateRange.start }
        : { gte: dateRange.start, lte: dateRange.end };

      const linesQuery = supabase
        .from("lines")
        .select("*, units(id, name), floors(id, name)")
        .eq("factory_id", factoryId)
        .order("line_id");

      let targetsQuery = supabase
        .from("sewing_targets")
        .select("line_id, work_order_id, production_date, per_hour_target, target_total_planned, hours_planned, manpower_planned")
        .eq("factory_id", factoryId);

      let actualsQuery = supabase
        .from("sewing_actuals")
        .select("line_id, work_order_id, production_date, good_today, manpower_actual, has_blocker, ot_hours_actual, ot_manpower_actual")
        .eq("factory_id", factoryId);

      if (timeRange === "daily") {
        targetsQuery = targetsQuery.eq("production_date", dateFilter.eq!);
        actualsQuery = actualsQuery.eq("production_date", dateFilter.eq!);
      } else {
        targetsQuery = targetsQuery
          .gte("production_date", dateFilter.gte!)
          .lte("production_date", dateFilter.lte!)
          .limit(5000);
        actualsQuery = actualsQuery
          .gte("production_date", dateFilter.gte!)
          .lte("production_date", dateFilter.lte!)
          .limit(5000);
      }

      const assignmentsQuery = supabase
        .from("work_order_line_assignments")
        .select("line_id, work_orders(id, po_number, buyer, style, item, is_active)")
        .eq("factory_id", factoryId);

      // In daily mode, fetch 30-day actuals separately for average output calculation
      const todayStr = getTodayInTimezone(timezone);
      const avg30Start = format(subDays(new Date(todayStr), 29), "yyyy-MM-dd");
      const avgActualsQuery = timeRange === "daily"
        ? supabase
            .from("sewing_actuals")
            .select("line_id, production_date, good_today")
            .eq("factory_id", factoryId)
            .gte("production_date", avg30Start)
            .lte("production_date", todayStr)
            .limit(5000)
        : null;

      const queries = [
        Promise.resolve(linesQuery),
        Promise.resolve(targetsQuery),
        Promise.resolve(actualsQuery),
        Promise.resolve(assignmentsQuery),
      ] as Promise<any>[];

      // Only fetch user line assignments if not admin
      if (userId && !isAdminOrHigher()) {
        queries.push(
          Promise.resolve(
            supabase
              .from("user_line_assignments")
              .select("line_id")
              .eq("user_id", userId)
          )
        );
      }

      const results = await Promise.all(queries);
      const [linesRes, targetsRes, actualsRes, assignmentsRes] = results;

      // Fetch 30-day avg actuals in parallel (non-blocking)
      const avgRes = avgActualsQuery ? await avgActualsQuery : null;

      setRawLines(linesRes.data || []);
      setRawTargets(targetsRes.data || []);
      setRawActuals(actualsRes.data || []);
      setRawAssignments(assignmentsRes.data || []);
      setRawAvgActuals(avgRes?.data || []);

      if (results[4]) {
        const ids = new Set<string>((results[4].data || []).map((r: any) => r.line_id));
        setUserLineIds(ids);
      }
    } catch (error) {
      console.error("Error fetching line performance data:", error);
    } finally {
      setLoading(false);
    }
  }, [factoryId, userId, dateRange, timeRange, isAdminOrHigher]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build work order map from assignments
  const woMap = useMemo(() => {
    const map = new Map<string, Map<string, { id: string; poNumber: string; buyer: string; style: string; item: string; isActive: boolean }>>();
    rawAssignments.forEach((a: any) => {
      const wo = a.work_orders;
      if (!wo || !a.line_id) return;
      if (!map.has(a.line_id)) map.set(a.line_id, new Map());
      const lineMap = map.get(a.line_id)!;
      if (!lineMap.has(wo.id)) {
        lineMap.set(wo.id, {
          id: wo.id,
          poNumber: wo.po_number || "",
          buyer: wo.buyer || "",
          style: wo.style || "",
          item: wo.item || "",
          isActive: wo.is_active ?? false,
        });
      }
    });
    return map;
  }, [rawAssignments]);

  // Extract unique units and floors
  const units = useMemo(() => {
    const seen = new Map<string, string>();
    rawLines.forEach((l: any) => {
      if (l.units?.id && l.units?.name) seen.set(l.units.id, l.units.name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawLines]);

  const floors = useMemo(() => {
    const seen = new Map<string, string>();
    rawLines.forEach((l: any) => {
      if (l.floors?.id && l.floors?.name) seen.set(l.floors.id, l.floors.name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawLines]);

  // Compute 30-day average output per line (daily mode uses rawAvgActuals; range modes use rawActuals)
  const avgOutputByLine = useMemo(() => {
    const source = timeRange === "daily" ? rawAvgActuals : rawActuals;
    // Group by line_id → { totalOutput, uniqueDays }
    const map = new Map<string, { total: number; days: Set<string> }>();
    source.forEach((a: any) => {
      if (!map.has(a.line_id)) map.set(a.line_id, { total: 0, days: new Set() });
      const entry = map.get(a.line_id)!;
      entry.total += a.good_today || 0;
      entry.days.add(a.production_date);
    });
    // Convert to avg + day count
    const result = new Map<string, { avg: number; days: number }>();
    map.forEach((val, lineId) => {
      result.set(lineId, {
        avg: val.days.size > 0 ? Math.round(val.total / val.days.size) : 0,
        days: val.days.size,
      });
    });
    return result;
  }, [rawAvgActuals, rawActuals, timeRange]);

  // Compute line performance data
  const lines = useMemo((): LinePerformanceData[] => {
    // Build a set of work_order_ids that have actuals submitted per line
    // so we can exclude target-only POs from achievement/variance stats
    const woIdsWithActuals = new Map<string, Set<string>>();
    rawActuals.forEach((a: any) => {
      if (!woIdsWithActuals.has(a.line_id)) woIdsWithActuals.set(a.line_id, new Set());
      woIdsWithActuals.get(a.line_id)!.add(a.work_order_id);
    });

    // Group targets by line_id + work_order_id, only for POs that have actuals
    const targetsByLine = new Map<string, Map<string, { total: number; manpower: number; dates: Set<string> }>>();
    rawTargets.forEach((t: any) => {
      // Skip target-only POs (no actuals submitted for this line + work order)
      const lineWoActuals = woIdsWithActuals.get(t.line_id);
      if (!lineWoActuals || !lineWoActuals.has(t.work_order_id)) return;

      if (!targetsByLine.has(t.line_id)) targetsByLine.set(t.line_id, new Map());
      const lineTargets = targetsByLine.get(t.line_id)!;
      if (!lineTargets.has(t.work_order_id)) {
        lineTargets.set(t.work_order_id, { total: 0, manpower: 0, dates: new Set() });
      }
      const entry = lineTargets.get(t.work_order_id)!;
      entry.total += resolveTarget(t);
      entry.manpower += t.manpower_planned || 0;
      entry.dates.add(t.production_date);
    });

    // Group actuals by line_id + work_order_id
    const actualsByLine = new Map<string, Map<string, { total: number; manpower: number; blockers: number; otHours: number; otManpower: number; dates: Set<string>; outputDates: Set<string> }>>();
    rawActuals.forEach((a: any) => {
      if (!actualsByLine.has(a.line_id)) actualsByLine.set(a.line_id, new Map());
      const lineActuals = actualsByLine.get(a.line_id)!;
      if (!lineActuals.has(a.work_order_id)) {
        lineActuals.set(a.work_order_id, { total: 0, manpower: 0, blockers: 0, otHours: 0, otManpower: 0, dates: new Set(), outputDates: new Set() });
      }
      const entry = lineActuals.get(a.work_order_id)!;
      entry.total += a.good_today || 0;
      entry.manpower += a.manpower_actual || 0;
      entry.otHours += a.ot_hours_actual || 0;
      entry.otManpower += a.ot_manpower_actual || 0;
      if (a.has_blocker) entry.blockers += 1;
      entry.dates.add(a.production_date);
      if (a.good_today > 0) entry.outputDates.add(a.production_date);
    });

    // Also track all target dates (including target-only) for dataState detection
    const allTargetsByLine = new Map<string, Set<string>>();
    // Unfiltered target totals per line (for display when awaiting EOD)
    const allTargetTotalsByLine = new Map<string, number>();
    rawTargets.forEach((t: any) => {
      if (!allTargetsByLine.has(t.line_id)) allTargetsByLine.set(t.line_id, new Set());
      allTargetsByLine.get(t.line_id)!.add(t.work_order_id);
      allTargetTotalsByLine.set(t.line_id, (allTargetTotalsByLine.get(t.line_id) || 0) + resolveTarget(t));
    });

    const result: LinePerformanceData[] = rawLines.map((line: any) => {
      const lineTargetMap = targetsByLine.get(line.id);
      const lineActualMap = actualsByLine.get(line.id);
      const lineWOs = woMap.get(line.id) || new Map();

      let totalTarget = 0;
      let totalOutput = 0;
      let totalManpower = 0;
      let totalOtHours = 0;
      let totalOtManpower = 0;
      let totalBlockers = 0;
      let dayCount = 0;

      const poBreakdown: POBreakdown[] = [];

      // Collect all WO IDs that have data (targets with actuals, or actuals alone)
      const allWoIds = new Set<string>();
      lineTargetMap?.forEach((_, woId) => allWoIds.add(woId));
      lineActualMap?.forEach((_, woId) => allWoIds.add(woId));

      allWoIds.forEach((woId) => {
        const woInfo = lineWOs.get(woId);
        const targetData = lineTargetMap?.get(woId);
        const actualData = lineActualMap?.get(woId);

        const poTarget = targetData?.total || 0;
        const poOutput = actualData?.total || 0;
        const poOutputDays = actualData?.outputDates?.size || 0;

        totalTarget += poTarget;
        totalOutput += poOutput;
        totalManpower += actualData?.manpower || 0;
        totalOtHours += actualData?.otHours || 0;
        totalOtManpower += actualData?.otManpower || 0;
        totalBlockers += actualData?.blockers || 0;

        const dates = new Set<string>();
        targetData?.dates.forEach((d) => dates.add(d));
        actualData?.dates.forEach((d) => dates.add(d));
        dayCount = Math.max(dayCount, dates.size);

        poBreakdown.push({
          workOrderId: woId,
          poNumber: woInfo?.poNumber || "Unknown PO",
          buyer: woInfo?.buyer || "",
          style: woInfo?.style || "",
          item: woInfo?.item || "",
          isActive: woInfo?.isActive ?? false,
          target: poTarget,
          output: poOutput,
          achievementPct: poTarget > 0 ? Math.round((poOutput / poTarget) * 100) : 0,
          avgDailyOutput: poOutputDays > 0 ? Math.round(poOutput / poOutputDays) : 0,
          activeDays: poOutputDays,
          targetContributionPct: 0, // computed after totals
          outputContributionPct: 0,
        });
      });

      // Compute contribution percentages
      poBreakdown.forEach((po) => {
        po.targetContributionPct = totalTarget > 0 ? Math.round((po.target / totalTarget) * 100) : 0;
        po.outputContributionPct = totalOutput > 0 ? Math.round((po.output / totalOutput) * 100) : 0;
      });

      // Sort POs by output descending
      poBreakdown.sort((a, b) => b.output - a.output);

      const achievementPct = totalTarget > 0 ? Math.round((totalOutput / totalTarget) * 100) : 0;
      const avgManpower = dayCount > 0 ? Math.round(totalManpower / dayCount) : totalManpower;

      // Use allTargetsByLine (unfiltered) for dataState so target-only lines still show "awaiting-eod"
      const targetSubmitted = (allTargetsByLine.get(line.id)?.size || 0) > 0;
      const eodSubmitted = (lineActualMap?.size || 0) > 0;
      const dataState: DataState =
        targetSubmitted && eodSubmitted ? "eod-submitted" :
        targetSubmitted ? "awaiting-eod" :
        eodSubmitted ? "output-only" :
        "no-target";

      // For awaiting-eod lines, use the unfiltered target total so the target is visible
      const displayTarget = dataState === "awaiting-eod"
        ? (allTargetTotalsByLine.get(line.id) || 0)
        : totalTarget;

      return {
        id: line.id,
        lineId: line.line_id,
        name: line.name,
        unitName: line.units?.name || null,
        floorName: line.floors?.name || null,
        isActive: line.is_active,
        totalTarget: displayTarget,
        totalOutput,
        achievementPct,
        variance: totalOutput - totalTarget,
        avgManpower,
        totalOtHours,
        totalOtManpower,
        totalBlockers,
        avgDailyOutput: avgOutputByLine.get(line.id)?.avg || 0,
        avgDailyOutputDays: avgOutputByLine.get(line.id)?.days || 0,
        targetSubmitted,
        eodSubmitted,
        dataState,
        // Only flag anomalies once EOD is submitted — before that, zero output is expected
        anomaly: eodSubmitted ? detectAnomaly(totalTarget, totalOutput, achievementPct) : null,
        poBreakdown,
      };
    });

    // Sort by line number
    result.sort((a, b) => compareLineNames(a.lineId, b.lineId));
    return result;
  }, [rawLines, rawTargets, rawActuals, woMap, avgOutputByLine]);

  // Build trend data per line (only for range modes)
  const trendData = useMemo((): Map<string, LineTrendData> => {
    if (timeRange === "daily") return new Map();

    const map = new Map<string, LineTrendData>();

    // Group actuals by line_id + date (build first so we can pair targets)
    const actualsByLineDate = new Map<string, Map<string, { output: number; manpower: number; blockers: number }>>();
    rawActuals.forEach((a: any) => {
      const key = a.line_id;
      if (!actualsByLineDate.has(key)) actualsByLineDate.set(key, new Map());
      const dateMap = actualsByLineDate.get(key)!;
      const existing = dateMap.get(a.production_date) || { output: 0, manpower: 0, blockers: 0 };
      existing.output += a.good_today || 0;
      existing.manpower += a.manpower_actual || 0;
      if (a.has_blocker) existing.blockers += 1;
      dateMap.set(a.production_date, existing);
    });

    // Group targets by line_id + date — only include targets where actuals exist for that line+date
    const targetsByLineDate = new Map<string, Map<string, number>>();
    rawTargets.forEach((t: any) => {
      const key = t.line_id;
      // Skip target-only: only include if there's a matching actual for this line + date
      const lineActuals = actualsByLineDate.get(key);
      if (!lineActuals || !lineActuals.has(t.production_date)) return;

      if (!targetsByLineDate.has(key)) targetsByLineDate.set(key, new Map());
      const dateMap = targetsByLineDate.get(key)!;
      dateMap.set(t.production_date, (dateMap.get(t.production_date) || 0) + resolveTarget(t));
    });

    // Group actuals by line_id + date + work_order_id for PO daily
    const poActualsByLineDate = new Map<string, Map<string, Map<string, number>>>();
    rawActuals.forEach((a: any) => {
      if (!poActualsByLineDate.has(a.line_id)) poActualsByLineDate.set(a.line_id, new Map());
      const lineMap = poActualsByLineDate.get(a.line_id)!;
      if (!lineMap.has(a.production_date)) lineMap.set(a.production_date, new Map());
      const dateMap = lineMap.get(a.production_date)!;
      dateMap.set(a.work_order_id, (dateMap.get(a.work_order_id) || 0) + (a.good_today || 0));
    });

    // Build trend data for each line
    const allDates = new Set<string>();
    targetsByLineDate.forEach((dateMap) => dateMap.forEach((_, d) => allDates.add(d)));
    actualsByLineDate.forEach((dateMap) => dateMap.forEach((_, d) => allDates.add(d)));
    const sortedDates = Array.from(allDates).sort();

    rawLines.forEach((line: any) => {
      const lineId = line.id;
      const targetDates = targetsByLineDate.get(lineId);
      const actualDates = actualsByLineDate.get(lineId);
      const poActualDates = poActualsByLineDate.get(lineId);

      if (!targetDates && !actualDates) return;

      const daily: DailyTrendPoint[] = sortedDates.map((date) => {
        const target = targetDates?.get(date) || 0;
        const actual = actualDates?.get(date) || { output: 0, manpower: 0, blockers: 0 };
        return {
          date,
          displayDate: formatShortDate(date),
          target,
          output: actual.output,
          achievementPct: target > 0 ? Math.round((actual.output / target) * 100) : 0,
          manpower: actual.manpower,
          blockers: actual.blockers,
        };
      }).filter((d) => d.target > 0 || d.output > 0);

      // Build PO daily breakdown
      const poDaily: Record<string, { poNumber: string; points: DailyTrendPoint[] }> = {};
      const lineWOs = woMap.get(lineId) || new Map();

      poActualDates?.forEach((dateMap, date) => {
        dateMap.forEach((output, woId) => {
          if (!poDaily[woId]) {
            const woInfo = lineWOs.get(woId);
            poDaily[woId] = { poNumber: woInfo?.poNumber || woId, points: [] };
          }
          poDaily[woId].points.push({
            date,
            displayDate: formatShortDate(date),
            target: 0,
            output,
            achievementPct: 0,
            manpower: 0,
            blockers: 0,
          });
        });
      });

      map.set(lineId, { daily, poDaily });
    });

    return map;
  }, [rawLines, rawTargets, rawActuals, woMap, timeRange]);

  // Apply filters (client-side)
  const filteredLines = useMemo(() => {
    let result = lines;

    // Role-based: non-admin users only see assigned lines
    if (!isAdminOrHigher() && userLineIds.size > 0) {
      result = result.filter((l) => userLineIds.has(l.id));
    }

    // Only show active lines by default
    result = result.filter((l) => l.isActive);

    const { searchTerm, unitFilter, floorFilter } = filters;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          (l.name || l.lineId).toLowerCase().includes(term) ||
          (l.unitName || "").toLowerCase().includes(term) ||
          (l.floorName || "").toLowerCase().includes(term)
      );
    }

    if (unitFilter) {
      result = result.filter((l) => l.unitName === unitFilter);
    }

    if (floorFilter) {
      result = result.filter((l) => l.floorName === floorFilter);
    }

    return result;
  }, [lines, filters, isAdminOrHigher, userLineIds]);

  // Factory summary
  const factorySummary = useMemo((): FactorySummary => {
    const activeLines = filteredLines;

    // Only count lines where EOD has been submitted — awaiting-eod (target-only) lines have unknown actual output
    const linesWithEOD = activeLines.filter((l) => l.dataState === "eod-submitted");

    // Compute totals from EOD-submitted lines only so target-only submissions don't skew stats
    const totalTarget = linesWithEOD.reduce((s, l) => s + l.totalTarget, 0);
    const totalOutput = linesWithEOD.reduce((s, l) => s + l.totalOutput, 0);
    const overallAchievement = totalTarget > 0 ? Math.round((totalOutput / totalTarget) * 100) : 0;
    const linesOnTarget = linesWithEOD.filter((l) => l.achievementPct >= 90).length;
    const linesBelowTarget = linesWithEOD.filter((l) => l.achievementPct < 90).length;

    // Best / worst among lines with target
    let bestLine: FactorySummary["bestLine"] = null;
    let worstLine: FactorySummary["worstLine"] = null;

    if (linesWithEOD.length > 0) {
      const sorted = [...linesWithEOD].sort((a, b) => b.achievementPct - a.achievementPct);
      bestLine = { name: sorted[0].name || sorted[0].lineId, pct: sorted[0].achievementPct };
      worstLine = {
        name: sorted[sorted.length - 1].name || sorted[sorted.length - 1].lineId,
        pct: sorted[sorted.length - 1].achievementPct,
      };
    }

    return { totalTarget, totalOutput, overallAchievement, linesOnTarget, linesBelowTarget, bestLine, worstLine };
  }, [filteredLines]);

  return {
    loading,
    selectedDate,
    setSelectedDate: handleDateChange,
    timeRange,
    setTimeRange,
    filters,
    setFilters,
    filteredLines,
    trendData,
    units,
    floors,
    factorySummary,
    refetch: fetchData,
    timezone,
    dateRange,
  };
}
