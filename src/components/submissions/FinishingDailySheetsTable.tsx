import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { effectivePoly, effectiveCarton } from "@/lib/finishing-utils";
import { useAuth } from "@/contexts/AuthContext";
import { formatShortDate, formatTimeInTimezone, getTodayInTimezone, getCurrentTimeInTimezone } from "@/lib/date-utils";
import { format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Search, ClipboardList, Eye, Target, TrendingUp, Download, X } from "lucide-react";
import { TableSkeleton, StatsCardsSkeleton } from "@/components/ui/table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { FinishingSubmissionView, FinishingTargetData, FinishingActualData } from "@/components/FinishingSubmissionView";
import { EditFinishingLogModal } from "@/components/EditFinishingLogModal";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePagination } from "@/hooks/usePagination";
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { Database } from "@/integrations/supabase/types";

type FinishingLogType = Database["public"]["Enums"]["finishing_log_type"];

interface DailyLogRow {
  id: string;
  production_date: string;
  line_name: string;
  line_id: string;
  work_order_id: string | null;
  po_number: string | null;
  buyer: string | null;
  style: string | null;
  log_type: FinishingLogType;
  thread_cutting: number;
  inside_check: number;
  top_side_check: number;
  buttoning: number;
  iron: number;
  get_up: number;
  poly: number;
  carton: number;
  planned_hours: number | null;
  actual_hours: number | null;
  ot_hours_actual: number | null;
  remarks: string | null;
  submitted_at: string;
  is_locked: boolean;
}

interface FinishingDailySheetsTableProps {
  factoryId: string;
  dateRange: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  activeTab: "targets" | "outputs";
  onCountsChange?: (counts: { targets: number; outputs: number }) => void;
}

export function FinishingDailySheetsTable({
  factoryId,
  dateRange,
  searchTerm,
  onSearchChange,
  activeTab,
  onCountsChange,
}: FinishingDailySheetsTableProps) {
  const { factory, isAdminOrHigher } = useAuth();
  const isAdmin = isAdminOrHigher();
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [editingLog, setEditingLog] = useState<DailyLogRow | null>(null);

  // Helper to format time in factory timezone
  const formatTime = (dateString: string) => {
    const timezone = factory?.timezone || "Asia/Dhaka";
    return formatTimeInTimezone(dateString, timezone);
  };
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<DailyLogRow | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    fetchLogs();
  }, [factoryId, dateRange]);

  async function fetchLogs() {
    setLoading(true);
    const timezone = factory?.timezone || "Asia/Dhaka";
    const endDateStr = getTodayInTimezone(timezone);
    const startDateObj = getCurrentTimeInTimezone(timezone);
    startDateObj.setDate(startDateObj.getDate() - parseInt(dateRange));
    const startDateStr = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, "0")}-${String(startDateObj.getDate()).padStart(2, "0")}`;

    try {
      const { data, error } = await supabase
        .from("finishing_daily_logs")
        .select(`
          *,
          lines(id, line_id, name),
          work_orders(po_number, buyer, style)
        `)
        .eq("factory_id", factoryId)
        .gte("production_date", startDateStr)
        .lte("production_date", endDateStr)
        .order("production_date", { ascending: false })
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      const formatted: DailyLogRow[] = (data || []).map((log: any) => ({
        id: log.id,
        production_date: log.production_date,
        line_name: "",
        line_id: "",
        work_order_id: log.work_order_id || null,
        po_number: log.work_orders?.po_number || null,
        buyer: log.work_orders?.buyer || null,
        style: log.work_orders?.style || null,
        log_type: log.log_type,
        thread_cutting: log.thread_cutting || 0,
        inside_check: log.inside_check || 0,
        top_side_check: log.top_side_check || 0,
        buttoning: log.buttoning || 0,
        iron: log.iron || 0,
        get_up: log.get_up || 0,
        poly: log.poly || 0,
        carton: log.carton || 0,
        planned_hours: log.planned_hours ?? null,
        actual_hours: log.actual_hours ?? null,
        ot_hours_actual: log.ot_hours_actual ?? null,
        remarks: log.remarks || null,
        submitted_at: log.submitted_at,
        is_locked: log.is_locked,
      }));

      setLogs(formatted);

      if (onCountsChange) {
        const targets = formatted.filter(l => l.log_type === "TARGET").length;
        const outputs = formatted.filter(l => l.log_type === "OUTPUT").length;
        onCountsChange({ targets, outputs });
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesTab = activeTab === "targets" ? log.log_type === "TARGET" : log.log_type === "OUTPUT";
      if (!matchesTab) return false;
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        (log.po_number?.toLowerCase() || "").includes(search) ||
        (log.style?.toLowerCase() || "").includes(search) ||
        (log.buyer?.toLowerCase() || "").includes(search)
      );
    });
  }, [logs, activeTab, searchTerm]);

  const { sortedData, sortConfig, requestSort } = useSortableTable(filteredLogs, { column: "production_date", direction: "desc" });

  const {
    currentPage,
    totalPages,
    paginatedData,
    setCurrentPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    canGoNext,
    canGoPrevious,
    startIndex,
    endIndex,
  } = usePagination(sortedData, { pageSize });

  // Stats based on active tab
  const tabLogs = logs.filter(l => activeTab === "targets" ? l.log_type === "TARGET" : l.log_type === "OUTPUT");
  const totalLogs = tabLogs.length;
  const totalPoly = tabLogs.reduce((sum, l) => sum + effectivePoly(l.poly, l.actual_hours, l.ot_hours_actual), 0);
  const totalCarton = tabLogs.reduce((sum, l) => sum + effectiveCarton(l.carton, l.actual_hours, l.ot_hours_actual), 0);

  // Daily output trend chart data
  const finishingDailyTrend = useMemo(() => {
    const outputLogs = logs.filter(l => l.log_type === "OUTPUT");
    if (outputLogs.length === 0) return [];
    const byDate: Record<string, { carton: number; poly: number }> = {};
    for (const l of outputLogs) {
      const d = l.production_date;
      if (!byDate[d]) byDate[d] = { carton: 0, poly: 0 };
      byDate[d].carton += effectiveCarton(l.carton, l.actual_hours, l.ot_hours_actual);
      byDate[d].poly += effectivePoly(l.poly, l.actual_hours, l.ot_hours_actual);
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        displayDate: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        carton: vals.carton,
        poly: vals.poly,
      }));
  }, [logs]);

  const allPageSelected = paginatedData.length > 0 && paginatedData.every(l => selectedIds.has(l.id));
  const somePageSelected = paginatedData.some(l => selectedIds.has(l.id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedData.forEach(l => next.delete(l.id));
      } else {
        paginatedData.forEach(l => next.add(l.id));
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
    const selected = sortedData.filter(l => selectedIds.has(l.id));
    const esc = (cell: string) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
    const exportDate = format(new Date(), "PPpp");
    const fileDate = format(new Date(), "yyyy-MM-dd");

    const rows: string[][] = [];

    // Report header
    rows.push([`FINISHING ${activeTab.toUpperCase()} REPORT`]);
    rows.push([`Factory: ${factory?.name || "—"}`]);
    rows.push([`Period: Last ${dateRange} days`]);
    rows.push([`Exported: ${exportDate}`]);
    rows.push([]);

    // Section summary
    const totalPoly = selected.reduce((s, l) => s + effectivePoly(l.poly, l.actual_hours, l.ot_hours_actual), 0);
    const totalCarton = selected.reduce((s, l) => s + effectiveCarton(l.carton, l.actual_hours, l.ot_hours_actual), 0);
    rows.push(["SUMMARY"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Total Records", String(selected.length)]);
    rows.push(["Total Poly", totalPoly.toLocaleString()]);
    rows.push(["Total Carton", totalCarton.toLocaleString()]);
    rows.push([]);

    // Data section
    rows.push([`═══ FINISHING ${activeTab.toUpperCase()} ═══`]);
    rows.push(["Date", "PO", "Buyer", "Style", "Type", "Thread Cutting", "Inside Check", "Top Side Check", "Buttoning", "Iron", "Get Up", "Poly", "Carton", "Planned Hours", "Actual Hours"]);
    selected.forEach(l => {
      rows.push([
        l.production_date,
        l.po_number || "-",
        l.buyer || "-",
        l.style || "-",
        l.log_type,
        String(l.thread_cutting),
        String(l.inside_check),
        String(l.top_side_check),
        String(l.buttoning),
        String(l.iron),
        String(l.get_up),
        String(effectivePoly(l.poly, l.actual_hours, l.ot_hours_actual)),
        String(effectiveCarton(l.carton, l.actual_hours, l.ot_hours_actual)),
        String(l.planned_hours ?? "-"),
        String(l.actual_hours ?? "-"),
      ]);
    });
    rows.push([]);
    rows.push(["═══ END OF REPORT ═══"]);

    const csvContent = rows.map(row => row.map(esc).join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finishing-${activeTab}-${fileDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} rows`);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <StatsCardsSkeleton count={3} />
        <TableSkeleton columns={7} rows={6} headers={["Date", "PO / Style", "Buyer", "Poly", "Carton", "Status", ""]} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalLogs}</p>
                    <p className="text-xs text-muted-foreground">
                      {activeTab === "targets" ? "Targets" : "Outputs"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-success">{totalPoly.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Poly</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-muted-foreground">{totalCarton.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Cartons</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Output Trend Chart */}
          {finishingDailyTrend.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Daily Output Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={finishingDailyTrend}>
                    <defs>
                      <linearGradient id="colorFinishingPoly" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
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
                      dataKey="poly"
                      name="Poly"
                      stroke="hsl(var(--primary))"
                      fill="url(#colorFinishingPoly)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="carton"
                      name="Carton"
                      stroke="hsl(var(--muted-foreground))"
                      fill="hsl(var(--muted-foreground))"
                      fillOpacity={0.1}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO, buyer, or style..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {activeTab === "targets" ? (
                  <Target className="h-4 w-4 text-primary" />
                ) : (
                  <Package className="h-4 w-4 text-violet-600" />
                )}
                {activeTab === "targets" ? "Finishing Targets" : "Finishing End of Day"}
                <Badge variant="secondary" className="ml-2">
                  {filteredLogs.length}
                </Badge>
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
                      <SortableTableHead column="production_date" sortConfig={sortConfig} onSort={requestSort}>Date</SortableTableHead>
                      <TableHead>PO / Style</TableHead>
                      <SortableTableHead column="buyer" sortConfig={sortConfig} onSort={requestSort}>Buyer</SortableTableHead>
                      <SortableTableHead column="poly" sortConfig={sortConfig} onSort={requestSort} className="text-right">Poly</SortableTableHead>
                      <SortableTableHead column="carton" sortConfig={sortConfig} onSort={requestSort} className="text-right">Carton</SortableTableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                      {paginatedData.map((log) => (
                        <TableRow
                          key={log.id}
                          className={`hover:bg-muted/50 cursor-pointer ${selectedIds.has(log.id) ? "bg-primary/5" : ""}`}
                          onClick={() => {
                            setSelectedLog(log);
                            setDetailModalOpen(true);
                          }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(log.id)}
                              onCheckedChange={() => toggleSelectRow(log.id)}
                              aria-label={`Select row`}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-mono text-sm">{formatShortDate(log.production_date)}</p>
                              <p className="text-xs text-muted-foreground">{formatTime(log.submitted_at)}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{log.po_number || "-"}</p>
                              <p className="text-xs text-muted-foreground">{log.style || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell>{log.buyer || "-"}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-bold text-success">
                              {effectivePoly(log.poly, log.actual_hours, log.ot_hours_actual).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-bold text-warning">
                              {effectiveCarton(log.carton, log.actual_hours, log.ot_hours_actual).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono text-sm">
                              {activeTab === "targets"
                                ? (log.planned_hours != null ? `${log.planned_hours}h` : "—")
                                : (log.actual_hours != null ? `${log.actual_hours}h` : "—")}
                            </span>
                          </TableCell>
                          <TableCell>
                            {log.is_locked ? (
                              <Badge variant="secondary">Locked</Badge>
                            ) : (
                              <Badge variant="default" className="bg-success hover:bg-success/90">
                                Submitted
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {paginatedData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p>No {activeTab === "targets" ? "targets" : "outputs"} found</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                </Table>
              </div>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={filteredLogs.length}
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
      {/* Finishing Submission View */}
      {(() => {
        const counterpart = selectedLog
          ? logs.find(l =>
              l.log_type !== selectedLog.log_type &&
              l.production_date === selectedLog.production_date &&
              l.work_order_id === selectedLog.work_order_id
            )
          : null;

        const targetLog = selectedLog?.log_type === "TARGET" ? selectedLog : counterpart?.log_type === "TARGET" ? counterpart : null;
        const actualLog = selectedLog?.log_type === "OUTPUT" ? selectedLog : counterpart?.log_type === "OUTPUT" ? counterpart : null;

        const target: FinishingTargetData | null = targetLog ? {
          id: targetLog.id,
          production_date: targetLog.production_date,
          submitted_at: targetLog.submitted_at,
          po_number: targetLog.po_number,
          buyer: targetLog.buyer,
          style: targetLog.style,
          thread_cutting: targetLog.thread_cutting,
          inside_check: targetLog.inside_check,
          top_side_check: targetLog.top_side_check,
          buttoning: targetLog.buttoning,
          iron: targetLog.iron,
          get_up: targetLog.get_up,
          poly: targetLog.poly,
          carton: targetLog.carton,
          m_power_planned: (targetLog as any).m_power_planned ?? null,
          planned_hours: targetLog.planned_hours ?? null,
          ot_hours_planned: (targetLog as any).ot_hours_planned ?? null,
          ot_manpower_planned: (targetLog as any).ot_manpower_planned ?? null,
          remarks: targetLog.remarks ?? null,
        } : null;

        const actual: FinishingActualData | null = actualLog ? {
          id: actualLog.id,
          production_date: actualLog.production_date,
          submitted_at: actualLog.submitted_at,
          po_number: actualLog.po_number,
          buyer: actualLog.buyer,
          style: actualLog.style,
          thread_cutting: actualLog.thread_cutting,
          inside_check: actualLog.inside_check,
          top_side_check: actualLog.top_side_check,
          buttoning: actualLog.buttoning,
          iron: actualLog.iron,
          get_up: actualLog.get_up,
          poly: actualLog.poly,
          carton: actualLog.carton,
          m_power_actual: (actualLog as any).m_power_actual ?? null,
          actual_hours: actualLog.actual_hours ?? null,
          ot_hours_actual: (actualLog as any).ot_hours_actual ?? null,
          ot_manpower_actual: (actualLog as any).ot_manpower_actual ?? null,
          remarks: actualLog.remarks ?? null,
        } : null;

        return (
          <FinishingSubmissionView
            target={target}
            actual={actual}
            open={detailModalOpen}
            onOpenChange={setDetailModalOpen}
            onEditTarget={isAdmin && targetLog ? () => {
              setEditingLog(targetLog);
              setDetailModalOpen(false);
            } : undefined}
            onEditActual={isAdmin && actualLog ? () => {
              setEditingLog(actualLog);
              setDetailModalOpen(false);
            } : undefined}
            onDeleteTarget={isAdmin && targetLog ? () => fetchLogs() : undefined}
            onDeleteActual={isAdmin && actualLog ? () => fetchLogs() : undefined}
          />
        );
      })()}

      {/* Finishing Edit Modal */}
      <EditFinishingLogModal
        log={editingLog}
        open={!!editingLog}
        onOpenChange={(open) => !open && setEditingLog(null)}
        onSaved={fetchLogs}
      />
    </div>
  );
}
