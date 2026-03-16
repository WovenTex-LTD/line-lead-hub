import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Warehouse, Search, Download, RefreshCw, FileText, Calendar, Target, ClipboardCheck, Scissors, TrendingUp, AlertTriangle, X } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { TableSkeleton, StatsCardsSkeleton } from "@/components/ui/table-skeleton";
import { SubmissionDetailModal } from "@/components/SubmissionDetailModal";
import { TargetDetailModal } from "@/components/TargetDetailModal";
import { SewingSubmissionView, SewingTargetData, SewingActualData } from "@/components/SewingSubmissionView";
import { EditSewingTargetModal } from "@/components/EditSewingTargetModal";
import { EditSewingActualModal } from "@/components/EditSewingActualModal";
import { ReportExportDialog } from "@/components/ReportExportDialog";
import { CuttingSubmissionsTable } from "@/components/submissions/CuttingSubmissionsTable";
import { FinishingDailySheetsTable } from "@/components/submissions/FinishingDailySheetsTable";
import { StorageSubmissionsTable } from "@/components/submissions/StorageSubmissionsTable";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePagination } from "@/hooks/usePagination";
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatShortDate, formatTimeInTimezone, getTodayInTimezone, getCurrentTimeInTimezone } from "@/lib/date-utils";
import { format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

// Types for targets
interface SewingTarget {
  id: string;
  line_id: string;
  work_order_id: string;
  per_hour_target: number;
  manpower_planned: number;
  ot_hours_planned: number;
  hours_planned: number | null;
  target_total_planned: number | null;
  planned_stage_progress: number;
  next_milestone: string | null;
  estimated_ex_factory: string | null;
  remarks: string | null;
  submitted_at: string | null;
  production_date: string;
  is_late: boolean | null;
  stages: { name: string } | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; order_qty: number } | null;
}

interface FinishingTarget {
  id: string;
  line_id: string;
  per_hour_target: number;
  m_power_planned: number;
  day_hour_planned: number;
  day_over_time_planned: number;
  remarks: string | null;
  submitted_at: string | null;
  production_date: string;
  is_late: boolean | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; order_qty: number } | null;
}

// Types for actuals/end of day
interface SewingActual {
  id: string;
  line_id: string;
  work_order_id: string;
  good_today: number;
  reject_today: number;
  rework_today: number;
  cumulative_good_total: number;
  manpower_actual: number;
  ot_hours_actual: number;
  ot_manpower_actual: number | null;
  hours_actual: number | null;
  actual_per_hour: number | null;
  actual_stage_progress: number;
  has_blocker: boolean | null;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  remarks: string | null;
  submitted_at: string | null;
  production_date: string;
  estimated_cost_value: number | null;
  estimated_cost_currency: string | null;
  stages: { name: string } | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; order_qty: number } | null;
}

interface FinishingActual {
  id: string;
  line_id: string;
  day_qc_pass: number;
  total_qc_pass: number;
  day_poly: number;
  total_poly: number;
  day_carton: number;
  total_carton: number;
  m_power_actual: number;
  ot_manpower_actual: number | null;
  day_hour_actual: number;
  day_over_time_actual: number;
  total_hour: number | null;
  total_over_time: number | null;
  average_production: number | null;
  has_blocker: boolean | null;
  blocker_description: string | null;
  blocker_impact: string | null;
  blocker_owner: string | null;
  remarks: string | null;
  submitted_at: string | null;
  production_date: string;
  estimated_cost_value: number | null;
  estimated_cost_currency: string | null;
  lines: { line_id: string; name: string | null } | null;
  work_orders: { po_number: string; buyer: string; style: string; order_qty: number } | null;
}

type CategoryType = 'targets' | 'actuals';
type DepartmentType = 'sewing' | 'finishing' | 'cutting' | 'storage';

export default function AllSubmissions() {
  const { profile, factory, isAdminOrHigher } = useAuth();
  const [searchParams] = useSearchParams();

  // Helper to format time in factory timezone
  const formatTime = (dateString: string) => {
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatTimeInTimezone(dateString, timezone);
  };
  const [loading, setLoading] = useState(true);
  
  // Initialize state from URL params or defaults
  const initialDepartment = (searchParams.get('department') as DepartmentType) || 'sewing';
  const initialCategory = (searchParams.get('category') as CategoryType) || 'targets';
  
  const [category, setCategory] = useState<CategoryType>(initialCategory);
  const [department, setDepartment] = useState<DepartmentType>(initialDepartment);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("7");

  // Target data
  const [sewingTargets, setSewingTargets] = useState<SewingTarget[]>([]);
  const [finishingTargets, setFinishingTargets] = useState<FinishingTarget[]>([]);

  // Actual data
  const [sewingActuals, setSewingActuals] = useState<SewingActual[]>([]);
  const [finishingActuals, setFinishingActuals] = useState<FinishingActual[]>([]);

  // Cutting and Storage data for export
  const [cuttingTargets, setCuttingTargets] = useState<any[]>([]);
  const [cuttingActuals, setCuttingActuals] = useState<any[]>([]);
  const [storageBinCards, setStorageBinCards] = useState<any[]>([]);

  // Finishing daily logs (newer system)
  const [finishingDailyLogs, setFinishingDailyLogs] = useState<any[]>([]);

  // Finishing log counts (reported by FinishingDailySheetsTable)
  const [finishingLogCounts, setFinishingLogCounts] = useState({ targets: 0, outputs: 0 });

  // Modal state
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [selectedActual, setSelectedActual] = useState<any>(null);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [actualModalOpen, setActualModalOpen] = useState(false);
  const [sewingViewOpen, setSewingViewOpen] = useState(false);
  const [sewingViewSource, setSewingViewSource] = useState<{ type: 'target' | 'actual'; id: string } | null>(null);
  const [editingSewingTarget, setEditingSewingTarget] = useState<SewingTarget | null>(null);
  const [editingSewingActual, setEditingSewingActual] = useState<SewingActual | null>(null);

  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (profile?.factory_id) {
      fetchSubmissions();
    }
  }, [profile?.factory_id, dateRange]);

  async function fetchSubmissions() {
    if (!profile?.factory_id) return;
    setLoading(true);

    const timezone = factory?.timezone || "Asia/Dhaka";
    const endDateStr = getTodayInTimezone(timezone);
    const endDateObj = getCurrentTimeInTimezone(timezone);
    const startDateObj = new Date(endDateObj);
    startDateObj.setDate(startDateObj.getDate() - parseInt(dateRange));
    const startDateStr = format(startDateObj, "yyyy-MM-dd");

    try {
      const [
        sewingTargetsRes,
        finishingTargetsRes,
        sewingActualsRes,
        finishingActualsRes,
        cuttingTargetsRes,
        cuttingActualsRes,
        storageBinCardsRes,
        finishingDailyLogsRes,
      ] = await Promise.all([
        supabase
          .from('sewing_targets')
          .select('*, stages:planned_stage_id(name), lines(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('finishing_targets')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('sewing_actuals')
          .select('*, stages:actual_stage_id(name), lines(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('finishing_actuals')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('cutting_targets')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('cutting_actuals')
          .select('*, lines!cutting_actuals_line_id_fkey(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('storage_bin_cards')
          .select('*, work_orders(po_number, buyer, style)')
          .eq('factory_id', profile.factory_id)
          .gte('created_at', startDateObj.toISOString())
          .lte('created_at', endDateObj.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('finishing_daily_logs')
          .select('*, lines(line_id, name), work_orders(po_number, buyer, style, order_qty)')
          .eq('factory_id', profile.factory_id)
          .gte('production_date', startDateStr)
          .lte('production_date', endDateStr)
          .order('production_date', { ascending: false })
          .order('submitted_at', { ascending: false }),
      ]);

      console.log('[AllSubmissions] fetch results:', {
        sewingTargets: sewingTargetsRes.data?.length, sewingTargetsErr: sewingTargetsRes.error,
        cuttingTargets: cuttingTargetsRes.data?.length, cuttingTargetsErr: cuttingTargetsRes.error,
        cuttingActuals: cuttingActualsRes.data?.length, cuttingActualsErr: cuttingActualsRes.error,
        finishingDailyLogs: finishingDailyLogsRes.data?.length, finishingDailyLogsErr: finishingDailyLogsRes.error,
        dateRange: { start: startDateStr, end: endDateStr },
      });
      setSewingTargets(sewingTargetsRes.data || []);
      setFinishingTargets(finishingTargetsRes.data || []);
      setSewingActuals(sewingActualsRes.data || []);
      setFinishingActuals(finishingActualsRes.data || []);
      setCuttingTargets(cuttingTargetsRes.data || []);
      setCuttingActuals(cuttingActualsRes.data || []);
      setStorageBinCards(storageBinCardsRes.data || []);
      setFinishingDailyLogs(finishingDailyLogsRes.data || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }

  // Filter functions
  const filterBySearch = <T extends { lines?: { line_id: string; name: string | null } | null; work_orders?: { po_number: string; buyer?: string } | null }>(items: T[]) => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      (item.lines?.name || item.lines?.line_id || '').toLowerCase().includes(term) ||
      (item.work_orders?.po_number || '').toLowerCase().includes(term) ||
      (item.work_orders?.buyer || '').toLowerCase().includes(term)
    );
  };

  // Get current sewing data based on category
  const sewingData = useMemo(() => {
    if (category === 'targets') {
      return filterBySearch(sewingTargets);
    } else {
      return filterBySearch(sewingActuals);
    }
  }, [category, sewingTargets, sewingActuals, searchTerm]);

  // Sort and paginate sewing targets
  const { sortedData: sortedSewingTargets, sortConfig: sewingTargetsSortConfig, requestSort: requestSewingTargetsSort } = useSortableTable(filterBySearch(sewingTargets), { column: "production_date", direction: "desc" });
  const { sortedData: sortedSewingActuals, sortConfig: sewingActualsSortConfig, requestSort: requestSewingActualsSort } = useSortableTable(filterBySearch(sewingActuals), { column: "production_date", direction: "desc" });
  const sewingTargetsPagination = usePagination(sortedSewingTargets, { pageSize });
  const sewingActualsPagination = usePagination(sortedSewingActuals, { pageSize });

  // Use the appropriate pagination based on category
  const pagination = category === 'targets' ? sewingTargetsPagination : sewingActualsPagination;
  const { currentPage, totalPages, setCurrentPage, goToFirstPage, goToLastPage, goToNextPage, goToPreviousPage, canGoNext, canGoPrevious, startIndex, endIndex } = pagination;

  // Summary stats
  const getCounts = () => ({
    sewingTargets: sewingTargets.length,
    finishingTargets: finishingTargets.length,
    sewingActuals: sewingActuals.length,
    finishingActuals: finishingActuals.length,
  });

  const counts = getCounts();

  // Sewing KPI stats from loaded data
  const sewingKpiStats = useMemo(() => {
    const data = category === 'targets' ? sewingTargets : sewingActuals;
    if (category === 'targets') {
      const targets = data as SewingTarget[];
      const avgTarget = targets.length > 0
        ? Math.round(targets.reduce((s, t) => s + t.per_hour_target, 0) / targets.length)
        : 0;
      const uniqueLines = new Set(targets.map(t => t.lines?.name || t.lines?.line_id)).size;
      return { count: targets.length, metric1: avgTarget, metric1Label: 'Avg Target/hr', metric2: avgTarget, metric2Label: 'Avg Target/hr', metric3: uniqueLines, metric3Label: 'Lines' };
    } else {
      const actuals = data as SewingActual[];
      const totalOutput = actuals.reduce((s, a) => s + (a.good_today || 0), 0);
      const totalRejects = actuals.reduce((s, a) => s + (a.reject_today || 0), 0);
      const avgActualPerHour = actuals.length > 0
        ? Math.round(actuals.reduce((s, a) => s + (a.actual_per_hour || 0), 0) / actuals.length)
        : 0;
      return { count: actuals.length, metric1: totalOutput, metric1Label: 'Total Output', metric2: avgActualPerHour, metric2Label: 'Avg Actual/hr', metric3: totalRejects, metric3Label: 'Total Rejects' };
    }
  }, [category, sewingTargets, sewingActuals]);

  // Build daily output trend from sewing actuals
  const sewingDailyTrend = useMemo(() => {
    if (sewingActuals.length === 0) return [];
    const byDate: Record<string, { output: number; rejects: number }> = {};
    for (const a of sewingActuals) {
      const d = a.production_date;
      if (!byDate[d]) byDate[d] = { output: 0, rejects: 0 };
      byDate[d].output += a.good_today || 0;
      byDate[d].rejects += a.reject_today || 0;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        displayDate: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        output: vals.output,
        rejects: vals.rejects,
      }));
  }, [sewingActuals]);

  // Sewing checkbox selection helpers
  const sewingPaginatedData = category === 'targets' ? sewingTargetsPagination.paginatedData : sewingActualsPagination.paginatedData;
  const sewingSortedData = category === 'targets' ? sortedSewingTargets : sortedSewingActuals;
  const allPageSelected = sewingPaginatedData.length > 0 && sewingPaginatedData.every(r => selectedIds.has(r.id));
  const somePageSelected = sewingPaginatedData.some(r => selectedIds.has(r.id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        sewingPaginatedData.forEach(r => next.delete(r.id));
      } else {
        sewingPaginatedData.forEach(r => next.add(r.id));
      }
      return next;
    });
  }

  function toggleSelectRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportSelectedCsv() {
    if (category === 'targets') {
      const rows = sewingSortedData.filter(r => selectedIds.has(r.id)) as SewingTarget[];
      const headers = ["Date", "Line", "PO", "Buyer", "Target/hr", "Manpower", "Progress %", "Stage", "Status"];
      const csvRows = [headers.join(",")];
      rows.forEach(r => {
        csvRows.push([
          r.production_date,
          `"${r.lines?.name || r.lines?.line_id || ""}"`,
          `"${r.work_orders?.po_number || ""}"`,
          `"${r.work_orders?.buyer || ""}"`,
          r.per_hour_target,
          r.manpower_planned,
          r.planned_stage_progress,
          `"${r.stages?.name || ""}"`,
          r.is_late ? "Late" : "On Time",
        ].join(","));
      });
      downloadCsvRows(csvRows, `sewing-targets-${format(new Date(), "yyyy-MM-dd")}.csv`, rows.length);
    } else {
      const rows = sewingSortedData.filter(r => selectedIds.has(r.id)) as SewingActual[];
      const headers = ["Date", "Line", "PO", "Buyer", "Good Today", "Cumulative", "Rejects", "Rework", "Manpower", "OT Hours", "Blocker"];
      const csvRows = [headers.join(",")];
      rows.forEach(r => {
        csvRows.push([
          r.production_date,
          `"${r.lines?.name || r.lines?.line_id || ""}"`,
          `"${r.work_orders?.po_number || ""}"`,
          `"${r.work_orders?.buyer || ""}"`,
          r.good_today,
          r.cumulative_good_total,
          r.reject_today,
          r.rework_today,
          r.manpower_actual,
          r.ot_hours_actual,
          r.has_blocker ? "Yes" : "No",
        ].join(","));
      });
      downloadCsvRows(csvRows, `sewing-actuals-${format(new Date(), "yyyy-MM-dd")}.csv`, rows.length);
    }
  }

  async function downloadCsvRows(csvRows: string[], filename: string, count: number) {
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    await downloadFile(blob, filename);
    toast.success(`Exported ${count} rows`);
  }

  const handleTargetClick = (target: SewingTarget | FinishingTarget) => {
    if (department === 'sewing') {
      setSewingViewSource({ type: 'target', id: target.id });
      setSewingViewOpen(true);
      return;
    }
    setSelectedTarget({
      ...target,
      type: department,
      stage_name: 'stages' in target ? target.stages?.name || null : null,
    });
    setTargetModalOpen(true);
  };

  const handleActualClick = (actual: SewingActual | FinishingActual) => {
    if (department === 'sewing') {
      setSewingViewSource({ type: 'actual', id: actual.id });
      setSewingViewOpen(true);
      return;
    }
    setSelectedActual({
      id: actual.id,
      type: department,
      line_name: actual.lines?.name || actual.lines?.line_id || 'Unknown',
      po_number: actual.work_orders?.po_number || null,
      buyer: actual.work_orders?.buyer,
      style: actual.work_orders?.style,
      has_blocker: actual.has_blocker,
      blocker_description: actual.blocker_description,
      blocker_impact: actual.blocker_impact,
      blocker_owner: actual.blocker_owner,
      blocker_status: null,
      submitted_at: actual.submitted_at,
      production_date: actual.production_date,
      remarks: actual.remarks,
      ...(department === 'finishing' && {
        day_qc_pass: (actual as FinishingActual).day_qc_pass,
        total_qc_pass: (actual as FinishingActual).total_qc_pass,
        day_poly: (actual as FinishingActual).day_poly,
        total_poly: (actual as FinishingActual).total_poly,
        day_carton: (actual as FinishingActual).day_carton,
        total_carton: (actual as FinishingActual).total_carton,
        m_power: (actual as FinishingActual).m_power_actual,
        average_production: (actual as FinishingActual).average_production,
        day_over_time: (actual as FinishingActual).day_over_time_actual,
        total_over_time: (actual as FinishingActual).total_over_time,
        day_hour: (actual as FinishingActual).day_hour_actual,
        total_hour: (actual as FinishingActual).total_hour,
        order_quantity: (actual as FinishingActual).work_orders?.order_qty ?? null,
        ot_manpower_actual: (actual as FinishingActual).ot_manpower_actual ?? null,
        estimated_cost_value: (actual as FinishingActual).estimated_cost_value ?? null,
        estimated_cost_currency: (actual as FinishingActual).estimated_cost_currency ?? null,
      }),
    });
    setActualModalOpen(true);
  };


  if (loading) {
    return (
      <div className="py-4 lg:py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            All Submissions
          </h1>
          <p className="text-muted-foreground">
            View and export historical targets and end of day data
          </p>
        </div>
        <StatsCardsSkeleton count={4} />
        <TableSkeleton columns={9} rows={8} />
      </div>
    );
  }

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">All Submissions</h1>
            <p className="text-sm text-muted-foreground">
              View and export historical targets and end of day data
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]">
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
          <Button variant="outline" size="sm" onClick={fetchSubmissions}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <ReportExportDialog />
        </div>
      </div>

      {/* Department Selection - Primary Tabs */}
      <div className="grid grid-cols-4 gap-3">
        <Button
          variant={department === 'storage' ? 'default' : 'outline'}
          className={`h-14 flex flex-col gap-0.5 ${department === 'storage' ? 'bg-orange-600 hover:bg-orange-700 border-orange-600' : 'hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 dark:hover:bg-orange-950/30 dark:hover:text-orange-300'}`}
          onClick={() => setDepartment('storage')}
        >
          <Warehouse className="h-4 w-4" />
          <span className="font-semibold text-sm">Storage</span>
        </Button>
        <Button
          variant={department === 'cutting' ? 'default' : 'outline'}
          className={`h-14 flex flex-col gap-0.5 ${department === 'cutting' ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600' : 'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300'}`}
          onClick={() => setDepartment('cutting')}
        >
          <Scissors className="h-4 w-4" />
          <span className="font-semibold text-sm">Cutting</span>
        </Button>
        <Button
          variant={department === 'sewing' ? 'default' : 'outline'}
          className={`h-14 flex flex-col gap-0.5 ${department === 'sewing' ? 'bg-blue-600 hover:bg-blue-700 border-blue-600' : 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300'}`}
          onClick={() => setDepartment('sewing')}
        >
          <SewingMachine className="h-4 w-4" />
          <span className="font-semibold text-sm">Sewing</span>
        </Button>
        <Button
          variant={department === 'finishing' ? 'default' : 'outline'}
          className={`h-14 flex flex-col gap-0.5 ${department === 'finishing' ? 'bg-violet-600 hover:bg-violet-700 border-violet-600' : 'hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 dark:hover:bg-violet-950/30 dark:hover:text-violet-300'}`}
          onClick={() => setDepartment('finishing')}
        >
          <Package className="h-4 w-4" />
          <span className="font-semibold text-sm">Finishing</span>
        </Button>
      </div>

      {/* Category Selection - For Sewing and Finishing */}
      {(department === 'sewing' || department === 'finishing') && (
        <div className="flex justify-center gap-2">
          <Button
            variant={category === 'targets' ? 'default' : 'outline'}
            onClick={() => { setCategory('targets'); setSelectedIds(new Set()); }}
            size="sm"
            className={`gap-1.5 ${
              category === 'targets'
                ? 'shadow-md'
                : 'hover:bg-primary/10 hover:border-primary/50'
            }`}
          >
            <Target className="h-4 w-4" />
            <span className="font-medium">Morning Targets</span>
            <Badge
              variant={category === 'targets' ? 'secondary' : 'outline'}
              className={`ml-0.5 text-xs ${category === 'targets' ? 'bg-primary-foreground/20 text-primary-foreground' : ''}`}
            >
              {department === 'sewing' ? counts.sewingTargets : finishingLogCounts.targets}
            </Badge>
          </Button>
          <Button
            variant={category === 'actuals' ? 'default' : 'outline'}
            onClick={() => { setCategory('actuals'); setSelectedIds(new Set()); }}
            size="sm"
            className={`gap-1.5 ${
              category === 'actuals'
                ? 'shadow-md'
                : 'hover:bg-primary/10 hover:border-primary/50'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" />
            <span className="font-medium">End of Day</span>
            <Badge
              variant={category === 'actuals' ? 'secondary' : 'outline'}
              className={`ml-0.5 text-xs ${category === 'actuals' ? 'bg-primary-foreground/20 text-primary-foreground' : ''}`}
            >
              {department === 'sewing' ? counts.sewingActuals : finishingLogCounts.outputs}
            </Badge>
          </Button>
        </div>
      )}

      {/* Finishing daily logs (targets + outputs from finishing_daily_logs table) */}
      {department === 'finishing' && profile?.factory_id && (
        <FinishingDailySheetsTable
          factoryId={profile.factory_id}
          dateRange={dateRange}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeTab={category === 'targets' ? 'targets' : 'outputs'}
          onCountsChange={setFinishingLogCounts}
        />
      )}

      {/* Cutting submissions */}
      {department === 'cutting' && profile?.factory_id && (
        <CuttingSubmissionsTable
          factoryId={profile.factory_id}
          dateRange={dateRange}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      )}

      {/* Storage bin cards */}
      {department === 'storage' && profile?.factory_id && (
        <StorageSubmissionsTable
          factoryId={profile.factory_id}
          dateRange={dateRange}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      )}

      {/* Sewing uses existing view */}
      {department === 'sewing' && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by line, PO, or buyer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <ClipboardCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Submissions</p>
                </div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sewingKpiStats.count}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{sewingKpiStats.metric1Label}</p>
                </div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">{sewingKpiStats.metric1.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <SewingMachine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{sewingKpiStats.metric2Label}</p>
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{sewingKpiStats.metric2.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${category === 'actuals' && sewingKpiStats.metric3 > 0 ? 'bg-amber-500/10' : 'bg-muted/50'}`}>
                    {category === 'actuals' ? (
                      <AlertTriangle className={`h-4 w-4 ${sewingKpiStats.metric3 > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} />
                    ) : (
                      <SewingMachine className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{sewingKpiStats.metric3Label}</p>
                </div>
                <div className={`text-2xl font-bold font-mono tabular-nums ${category === 'actuals' && sewingKpiStats.metric3 > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                  {sewingKpiStats.metric3.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Output Trend Chart */}
          {sewingDailyTrend.length > 1 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Daily Output Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={sewingDailyTrend}>
                    <defs>
                      <linearGradient id="colorSewingOutput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="displayDate" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={40} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="output"
                      name="Output"
                      stroke="#2563eb"
                      fill="url(#colorSewingOutput)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="rejects"
                      name="Rejects"
                      stroke="#dc2626"
                      fill="#dc2626"
                      fillOpacity={0.1}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Data Table */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {category === 'targets' ? (
                  <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <ClipboardCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                )}
                Sewing {category === 'targets' ? 'Targets' : 'End of Day'}
                <Badge variant="secondary" className="ml-2">{sewingData.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Button variant="outline" size="sm" onClick={exportSelectedCsv}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export CSV
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Clear
                  </Button>
                </div>
              )}
              <div className="overflow-x-auto">
                {category === 'targets' && (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={allPageSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                            {...(somePageSelected && !allPageSelected ? { "data-state": "indeterminate" } : {})}
                          />
                        </TableHead>
                        <SortableTableHead column="production_date" sortConfig={sewingTargetsSortConfig} onSort={requestSewingTargetsSort}>Date</SortableTableHead>
                        <TableHead>Time</TableHead>
                        <SortableTableHead column="lines.name" sortConfig={sewingTargetsSortConfig} onSort={requestSewingTargetsSort}>Line</SortableTableHead>
                        <TableHead>PO</TableHead>
                        <SortableTableHead column="work_orders.buyer" sortConfig={sewingTargetsSortConfig} onSort={requestSewingTargetsSort}>Buyer</SortableTableHead>
                        <SortableTableHead column="per_hour_target" sortConfig={sewingTargetsSortConfig} onSort={requestSewingTargetsSort} className="text-right">Target/hr</SortableTableHead>
                        <SortableTableHead column="manpower_planned" sortConfig={sewingTargetsSortConfig} onSort={requestSewingTargetsSort} className="text-right">Manpower</SortableTableHead>
                        <SortableTableHead column="planned_stage_progress" sortConfig={sewingTargetsSortConfig} onSort={requestSewingTargetsSort} className="text-right">Progress</SortableTableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sewingTargetsPagination.paginatedData.map((target) => (
                        <TableRow
                          key={target.id}
                          className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(target.id) ? "bg-primary/5" : ""}`}
                          onClick={() => handleTargetClick(target)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(target.id)}
                              onCheckedChange={() => toggleSelectRow(target.id)}
                              aria-label="Select row"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatShortDate(target.production_date)}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{target.submitted_at ? formatTime(target.submitted_at) : '-'}</TableCell>
                          <TableCell className="font-medium">{target.lines?.name || target.lines?.line_id}</TableCell>
                          <TableCell>{target.work_orders?.po_number || '-'}</TableCell>
                          <TableCell>{target.work_orders?.buyer || '-'}</TableCell>
                          <TableCell className="text-right font-mono font-bold">{target.per_hour_target}</TableCell>
                          <TableCell className="text-right">{target.manpower_planned}</TableCell>
                          <TableCell className="text-right">{target.planned_stage_progress}%</TableCell>
                          <TableCell>
                            {target.is_late ? (
                              <StatusBadge variant="warning" size="sm">Late</StatusBadge>
                            ) : (
                              <StatusBadge variant="success" size="sm">On Time</StatusBadge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {sewingTargetsPagination.paginatedData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            No sewing targets found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}

                {category === 'actuals' && (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={allPageSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                            {...(somePageSelected && !allPageSelected ? { "data-state": "indeterminate" } : {})}
                          />
                        </TableHead>
                        <SortableTableHead column="production_date" sortConfig={sewingActualsSortConfig} onSort={requestSewingActualsSort}>Date</SortableTableHead>
                        <TableHead>Time</TableHead>
                        <SortableTableHead column="lines.name" sortConfig={sewingActualsSortConfig} onSort={requestSewingActualsSort}>Line</SortableTableHead>
                        <TableHead>PO</TableHead>
                        <SortableTableHead column="work_orders.buyer" sortConfig={sewingActualsSortConfig} onSort={requestSewingActualsSort}>Buyer</SortableTableHead>
                        <SortableTableHead column="good_today" sortConfig={sewingActualsSortConfig} onSort={requestSewingActualsSort} className="text-right">Good Today</SortableTableHead>
                        <SortableTableHead column="cumulative_good_total" sortConfig={sewingActualsSortConfig} onSort={requestSewingActualsSort} className="text-right">Cumulative</SortableTableHead>
                        <SortableTableHead column="manpower_actual" sortConfig={sewingActualsSortConfig} onSort={requestSewingActualsSort} className="text-right">Manpower</SortableTableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sewingActualsPagination.paginatedData.map((actual) => (
                        <TableRow
                          key={actual.id}
                          className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(actual.id) ? "bg-primary/5" : ""}`}
                          onClick={() => handleActualClick(actual)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(actual.id)}
                              onCheckedChange={() => toggleSelectRow(actual.id)}
                              aria-label="Select row"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatShortDate(actual.production_date)}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{actual.submitted_at ? formatTime(actual.submitted_at) : '-'}</TableCell>
                          <TableCell className="font-medium">{actual.lines?.name || actual.lines?.line_id}</TableCell>
                          <TableCell>{actual.work_orders?.po_number || '-'}</TableCell>
                          <TableCell>{actual.work_orders?.buyer || '-'}</TableCell>
                          <TableCell className="text-right font-mono font-bold">{actual.good_today.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{actual.cumulative_good_total.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{actual.manpower_actual}</TableCell>
                          <TableCell>
                            {actual.has_blocker ? (
                              <StatusBadge variant="danger" size="sm">Blocker</StatusBadge>
                            ) : (
                              <StatusBadge variant="success" size="sm">OK</StatusBadge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {sewingActualsPagination.paginatedData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            No sewing end of day data found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={sewingData.length}
                onPageChange={setCurrentPage}
                onFirstPage={goToFirstPage}
                onLastPage={goToLastPage}
                onNextPage={goToNextPage}
                onPreviousPage={goToPreviousPage}
                canGoNext={canGoNext}
                canGoPrevious={canGoPrevious}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Target Detail Modal */}
      <TargetDetailModal
        target={selectedTarget}
        open={targetModalOpen}
        onOpenChange={setTargetModalOpen}
      />

      {/* Actual Detail Modal (finishing only now) */}
      <SubmissionDetailModal
        submission={selectedActual}
        open={actualModalOpen}
        onOpenChange={setActualModalOpen}
        onDeleted={fetchSubmissions}
        onUpdated={fetchSubmissions}
      />

      {/* Sewing Submission View */}
      {(() => {
        if (!sewingViewSource) return null;
        let sewingTarget: SewingTargetData | null = null;
        let sewingActual: SewingActualData | null = null;

        const buildTarget = (t: SewingTarget): SewingTargetData => ({
          id: t.id,
          production_date: t.production_date,
          line_name: t.lines?.name || t.lines?.line_id || 'Unknown',
          po_number: t.work_orders?.po_number || null,
          buyer: t.work_orders?.buyer || null,
          style: t.work_orders?.style || null,
          order_qty: t.work_orders?.order_qty ?? null,
          submitted_at: t.submitted_at,
          per_hour_target: t.per_hour_target,
          manpower_planned: t.manpower_planned,
          ot_hours_planned: t.ot_hours_planned,
          hours_planned: t.hours_planned ?? null,
          target_total_planned: t.target_total_planned ?? null,
          stage_name: t.stages?.name || null,
          planned_stage_progress: t.planned_stage_progress,
          next_milestone: t.next_milestone,
          estimated_ex_factory: t.estimated_ex_factory ?? null,
          remarks: t.remarks,
        });

        const buildActual = (a: SewingActual): SewingActualData => ({
          id: a.id,
          production_date: a.production_date,
          line_name: a.lines?.name || a.lines?.line_id || 'Unknown',
          po_number: a.work_orders?.po_number || null,
          buyer: a.work_orders?.buyer || null,
          style: a.work_orders?.style || null,
          order_qty: a.work_orders?.order_qty ?? null,
          submitted_at: a.submitted_at,
          good_today: a.good_today,
          reject_today: a.reject_today,
          rework_today: a.rework_today,
          cumulative_good_total: a.cumulative_good_total,
          manpower_actual: a.manpower_actual,
          ot_hours_actual: a.ot_hours_actual,
          ot_manpower_actual: a.ot_manpower_actual,
          hours_actual: a.hours_actual ?? null,
          actual_per_hour: a.actual_per_hour ?? null,
          stage_name: a.stages?.name || null,
          actual_stage_progress: a.actual_stage_progress,
          remarks: a.remarks,
          has_blocker: a.has_blocker,
          blocker_description: a.blocker_description,
          blocker_impact: a.blocker_impact,
          blocker_owner: a.blocker_owner,
          blocker_status: null,
          estimated_cost_value: a.estimated_cost_value ?? null,
          estimated_cost_currency: a.estimated_cost_currency ?? null,
        });

        let rawTarget: SewingTarget | null = null;
        let rawActual: SewingActual | null = null;

        if (sewingViewSource.type === 'target') {
          const t = sewingTargets.find(t => t.id === sewingViewSource.id);
          if (t) {
            rawTarget = t;
            sewingTarget = buildTarget(t);
            const ma = sewingActuals.find(a =>
              a.line_id === t.line_id && a.work_order_id === t.work_order_id && a.production_date === t.production_date
            );
            if (ma) { rawActual = ma; sewingActual = buildActual(ma); }
          }
        } else {
          const a = sewingActuals.find(a => a.id === sewingViewSource.id);
          if (a) {
            rawActual = a;
            sewingActual = buildActual(a);
            const mt = sewingTargets.find(t =>
              t.line_id === a.line_id && t.work_order_id === a.work_order_id && t.production_date === a.production_date
            );
            if (mt) { rawTarget = mt; sewingTarget = buildTarget(mt); }
          }
        }

        const isAdmin = isAdminOrHigher();

        return (
          <SewingSubmissionView
            target={sewingTarget}
            actual={sewingActual}
            open={sewingViewOpen}
            onOpenChange={setSewingViewOpen}
            onEditTarget={isAdmin && rawTarget ? () => {
              setEditingSewingTarget(rawTarget);
              setSewingViewOpen(false);
            } : undefined}
            onEditActual={isAdmin && rawActual ? () => {
              setEditingSewingActual(rawActual);
              setSewingViewOpen(false);
            } : undefined}
            onDeleteTarget={isAdmin && rawTarget ? () => fetchSubmissions() : undefined}
            onDeleteActual={isAdmin && rawActual ? () => fetchSubmissions() : undefined}
          />
        );
      })()}


      {/* Sewing Edit Modals */}
      <EditSewingTargetModal
        target={editingSewingTarget}
        open={!!editingSewingTarget}
        onOpenChange={(open) => !open && setEditingSewingTarget(null)}
        onSaved={fetchSubmissions}
      />
      <EditSewingActualModal
        submission={editingSewingActual}
        open={!!editingSewingActual}
        onOpenChange={(open) => !open && setEditingSewingActual(null)}
        onSaved={fetchSubmissions}
      />
    </div>
  );
}
