import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayInTimezone } from "@/lib/date-utils";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { Search, Scissors, Package, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableSkeleton, StatsCardsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePagination } from "@/hooks/usePagination";
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { CuttingSubmissionView } from "@/components/CuttingSubmissionView";
import { EditCuttingTargetModal } from "@/components/EditCuttingTargetModal";
import { EditCuttingActualModal } from "@/components/EditCuttingActualModal";

interface CuttingSubmission {
  id: string;
  production_date: string;
  submitted_at: string | null;
  line_id: string;
  work_order_id: string;
  buyer: string | null;
  style: string | null;
  po_no: string | null;
  colour: string | null;
  order_qty: number | null;
  man_power: number;
  marker_capacity: number;
  lay_capacity: number;
  cutting_capacity: number;
  under_qty: number | null;
  day_cutting: number;
  total_cutting: number | null;
  day_input: number;
  total_input: number | null;
  balance: number | null;
  leftover_recorded: boolean | null;
  leftover_quantity: number | null;
  leftover_unit: string | null;
  lines?: { line_id: string; name: string | null };
  work_orders?: { po_number: string; buyer: string; style: string };
}

interface CuttingSubmissionsTableProps {
  factoryId: string;
  dateRange: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export function CuttingSubmissionsTable({
  factoryId,
  dateRange,
  searchTerm,
  onSearchChange,
}: CuttingSubmissionsTableProps) {
  const { factory, isAdminOrHigher } = useAuth();
  const isAdmin = isAdminOrHigher();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<CuttingSubmission[]>([]);
  const [targetsMap, setTargetsMap] = useState<Map<string, any>>(new Map());
  const [actualsMap, setActualsMap] = useState<Map<string, any>>(new Map());
  const [selectedSubmission, setSelectedSubmission] = useState<CuttingSubmission | null>(null);
  const [editingTarget, setEditingTarget] = useState<any>(null);
  const [editingActual, setEditingActual] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    fetchData();
  }, [factoryId, dateRange]);

  async function fetchData() {
    setLoading(true);
    const endDate = new Date();
    const startDate = subDays(endDate, parseInt(dateRange));

    try {
      const [actualsRes, targetsRes] = await Promise.all([
        supabase
          .from("cutting_actuals")
          .select("*, lines!cutting_actuals_line_id_fkey(line_id, name), work_orders(po_number, buyer, style)")
          .eq("factory_id", factoryId)
          .gte("production_date", format(startDate, "yyyy-MM-dd"))
          .lte("production_date", format(endDate, "yyyy-MM-dd"))
          .order("production_date", { ascending: false }),
        supabase
          .from("cutting_targets")
          .select("*, lines(line_id, name), work_orders(po_number, buyer, style)")
          .eq("factory_id", factoryId)
          .gte("production_date", format(startDate, "yyyy-MM-dd"))
          .lte("production_date", format(endDate, "yyyy-MM-dd")),
      ]);

      const tgtMap = new Map<string, any>();
      (targetsRes.data || []).forEach(t => {
        const key = `${t.production_date}-${t.line_id}-${t.work_order_id}`;
        tgtMap.set(key, t);
      });
      setTargetsMap(tgtMap);

      const actMap = new Map<string, any>();
      (actualsRes.data || []).forEach(a => {
        const key = `${a.production_date}-${a.line_id}-${a.work_order_id}`;
        actMap.set(key, a);
      });
      setActualsMap(actMap);

      const matchedTargetKeys = new Set<string>();

      const mergedSubmissions: CuttingSubmission[] = (actualsRes.data || []).map(actual => {
        const key = `${actual.production_date}-${actual.line_id}-${actual.work_order_id}`;
        const target = tgtMap.get(key);
        if (target) matchedTargetKeys.add(key);
        return {
          id: actual.id,
          production_date: actual.production_date,
          submitted_at: actual.submitted_at,
          line_id: actual.line_id,
          work_order_id: actual.work_order_id,
          buyer: actual.buyer,
          style: actual.style,
          po_no: actual.po_no,
          colour: actual.colour,
          order_qty: actual.order_qty,
          man_power: target?.man_power || 0,
          marker_capacity: target?.marker_capacity || 0,
          lay_capacity: target?.lay_capacity || 0,
          cutting_capacity: target?.cutting_capacity || 0,
          under_qty: target?.under_qty || null,
          day_cutting: actual.day_cutting,
          total_cutting: actual.total_cutting,
          day_input: actual.day_input,
          total_input: actual.total_input,
          balance: actual.balance,
          leftover_recorded: actual.leftover_recorded,
          leftover_quantity: actual.leftover_quantity,
          leftover_unit: actual.leftover_unit,
          lines: actual.lines,
          work_orders: actual.work_orders,
        };
      });

      // Include targets that have no matching actuals
      (targetsRes.data || []).forEach((target: any) => {
        const key = `${target.production_date}-${target.line_id}-${target.work_order_id}`;
        if (!matchedTargetKeys.has(key)) {
          mergedSubmissions.push({
            id: target.id,
            production_date: target.production_date,
            submitted_at: target.submitted_at,
            line_id: target.line_id,
            work_order_id: target.work_order_id,
            buyer: target.work_orders?.buyer || null,
            style: target.work_orders?.style || null,
            po_no: target.work_orders?.po_number || null,
            colour: null,
            order_qty: target.order_qty || null,
            man_power: target.man_power || 0,
            marker_capacity: target.marker_capacity || 0,
            lay_capacity: target.lay_capacity || 0,
            cutting_capacity: target.cutting_capacity || 0,
            under_qty: target.under_qty || null,
            day_cutting: 0,
            total_cutting: null,
            day_input: 0,
            total_input: null,
            balance: null,
            leftover_recorded: null,
            leftover_quantity: null,
            leftover_unit: null,
            lines: target.lines,
            work_orders: target.work_orders,
          });
        }
      });

      // Sort by production_date descending
      mergedSubmissions.sort((a, b) => b.production_date.localeCompare(a.production_date));

      setSubmissions(mergedSubmissions);
    } catch (error) {
      console.error("Error fetching cutting data:", error);
      toast.error("Failed to load cutting submissions");
    } finally {
      setLoading(false);
    }
  }

  const filteredSubmissions = useMemo(() => {
    if (!searchTerm) return submissions;
    const term = searchTerm.toLowerCase();
    return submissions.filter(s =>
      (s.lines?.name || s.lines?.line_id || "").toLowerCase().includes(term) ||
      (s.work_orders?.po_number || s.po_no || "").toLowerCase().includes(term) ||
      (s.work_orders?.buyer || s.buyer || "").toLowerCase().includes(term)
    );
  }, [submissions, searchTerm]);

  const { sortedData, sortConfig, requestSort } = useSortableTable(filteredSubmissions, { column: "production_date", direction: "desc" });

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
  const stats = useMemo(() => {
    const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
    const todaySubmissions = submissions.filter(s => s.production_date === today);
    
    // Calculate total leftover fabric in yards
    const totalLeftoverYards = submissions
      .filter(s => s.leftover_recorded && s.leftover_quantity && s.leftover_quantity > 0)
      .reduce((sum, s) => {
        const qty = s.leftover_quantity || 0;
        const unit = s.leftover_unit || "pcs";
        // Convert to yards based on unit
        if (unit === "yard") return sum + qty;
        if (unit === "meter") return sum + qty * 1.0936; // meters to yards
        if (unit === "kg") return sum + qty * 3; // approximate: 1kg ≈ 3 yards
        if (unit === "roll") return sum + qty * 50; // approximate: 1 roll ≈ 50 yards
        return sum + qty; // pcs and other units as-is
      }, 0);
    
    return {
      total: submissions.length,
      todayCount: todaySubmissions.length,
      totalCutting: submissions.reduce((sum, s) => sum + (s.day_cutting || 0), 0),
      totalInput: submissions.reduce((sum, s) => sum + (s.day_input || 0), 0),
      totalLeftoverYards: Math.round(totalLeftoverYards * 100) / 100,
    };
  }, [submissions]);

  const allPageSelected = paginatedData.length > 0 && paginatedData.every(s => selectedIds.has(s.id));
  const somePageSelected = paginatedData.some(s => selectedIds.has(s.id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedData.forEach(s => next.delete(s.id));
      } else {
        paginatedData.forEach(s => next.add(s.id));
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

  async function exportSelectedCsv() {
    const rows = sortedData.filter(s => selectedIds.has(s.id));
    const headers = ["Date", "Line", "PO", "Buyer", "Order Qty", "Target", "Day Cutting", "Total Cutting", "Day Input", "Total Input", "Balance"];
    const csvRows = [headers.join(",")];
    rows.forEach(s => {
      csvRows.push([
        s.production_date,
        `"${s.lines?.name || s.lines?.line_id || ""}"`,
        `"${s.work_orders?.po_number || s.po_no || ""}"`,
        `"${s.work_orders?.buyer || s.buyer || ""}"`,
        s.order_qty ?? "",
        s.cutting_capacity || "",
        s.day_cutting,
        s.total_cutting ?? "",
        s.day_input,
        s.total_input ?? "",
        s.balance ?? "",
      ].join(","));
    });
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    await downloadFile(blob, `cutting-submissions-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success(`Exported ${rows.length} rows`);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <StatsCardsSkeleton count={4} />
        <TableSkeleton columns={9} rows={6} headers={["Date", "Line", "PO", "Buyer", "Order Qty", "Target", "Actual", "%", "Balance"]} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Total Submissions</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase flex items-center gap-1">
              <Package className="h-3 w-3" />
              Left Over Fabric
            </p>
            <p className="text-xl font-bold">{stats.totalLeftoverYards.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})} <span className="text-sm font-normal text-muted-foreground">yards</span></p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Total Cutting</p>
            <p className="text-xl font-bold">{stats.totalCutting.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase">Total Input</p>
            <p className="text-xl font-bold">{stats.totalInput.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by line, PO, or buyer..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />
            Cutting Submissions
            <Badge variant="secondary" className="ml-2">{filteredSubmissions.length}</Badge>
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
                  <SortableTableHead column="lines.name" sortConfig={sortConfig} onSort={requestSort}>Line</SortableTableHead>
                  <TableHead>PO</TableHead>
                  <SortableTableHead column="work_orders.buyer" sortConfig={sortConfig} onSort={requestSort}>Buyer</SortableTableHead>
                  <SortableTableHead column="order_qty" sortConfig={sortConfig} onSort={requestSort} className="text-right">Order Qty</SortableTableHead>
                  <SortableTableHead column="cutting_capacity" sortConfig={sortConfig} onSort={requestSort} className="text-right">Target</SortableTableHead>
                  <SortableTableHead column="day_cutting" sortConfig={sortConfig} onSort={requestSort} className="text-right">Actual</SortableTableHead>
                  <TableHead className="text-right">%</TableHead>
                  <SortableTableHead column="balance" sortConfig={sortConfig} onSort={requestSort} className="text-right">Balance</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No cutting submissions found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((s) => {
                    const percent = s.cutting_capacity > 0 ? (s.day_cutting / s.cutting_capacity) * 100 : null;
                    return (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(s.id) ? "bg-primary/5" : ""}`}
                        onClick={() => setSelectedSubmission(s)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(s.id)}
                            onCheckedChange={() => toggleSelectRow(s.id)}
                            aria-label={`Select row`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(s.production_date), "MMM d")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.lines?.name || s.lines?.line_id || "—"}</Badge>
                        </TableCell>
                        <TableCell>{s.work_orders?.po_number || s.po_no || "—"}</TableCell>
                        <TableCell>{s.work_orders?.buyer || s.buyer || "—"}</TableCell>
                        <TableCell className="text-right">{s.order_qty?.toLocaleString() || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {s.cutting_capacity > 0 ? s.cutting_capacity.toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">{s.day_cutting.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {percent !== null ? (
                            <span className={`font-medium ${percent >= 100 ? 'text-green-600' : percent >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                              {Math.round(percent)}%
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${s.balance && s.balance < 0 ? "text-destructive" : ""}`}>
                          {s.balance?.toLocaleString() || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={filteredSubmissions.length}
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

      {/* Detail Modal */}
      {(() => {
        if (!selectedSubmission) return null;
        const key = `${selectedSubmission.production_date}-${selectedSubmission.line_id}-${selectedSubmission.work_order_id}`;
        const rawTarget = targetsMap.get(key);
        const rawActual = actualsMap.get(key);
        const lineName = selectedSubmission.lines?.name || selectedSubmission.lines?.line_id || "—";
        const buyer = selectedSubmission.work_orders?.buyer || selectedSubmission.buyer || null;
        const style = selectedSubmission.work_orders?.style || selectedSubmission.style || null;
        const poNumber = selectedSubmission.work_orders?.po_number || selectedSubmission.po_no || null;

        return (
          <CuttingSubmissionView
            target={rawTarget ? {
              id: rawTarget.id,
              production_date: rawTarget.production_date,
              line_name: rawTarget.lines?.name || rawTarget.lines?.line_id || lineName,
              buyer: rawTarget.work_orders?.buyer || rawTarget.buyer || buyer,
              style: rawTarget.work_orders?.style || rawTarget.style || style,
              po_number: rawTarget.work_orders?.po_number || rawTarget.po_no || poNumber,
              colour: rawTarget.colour || null,
              order_qty: rawTarget.order_qty || selectedSubmission.order_qty,
              submitted_at: rawTarget.submitted_at,
              man_power: rawTarget.man_power,
              marker_capacity: rawTarget.marker_capacity,
              lay_capacity: rawTarget.lay_capacity,
              cutting_capacity: rawTarget.cutting_capacity,
              under_qty: rawTarget.under_qty,
              day_cutting: rawTarget.day_cutting,
              day_input: rawTarget.day_input,
              ot_hours_planned: rawTarget.ot_hours_planned ?? null,
              ot_manpower_planned: rawTarget.ot_manpower_planned ?? null,
              hours_planned: rawTarget.hours_planned ?? null,
              target_per_hour: rawTarget.target_per_hour ?? null,
            } : null}
            actual={rawActual ? {
              id: rawActual.id,
              production_date: rawActual.production_date,
              line_name: rawActual.lines?.name || rawActual.lines?.line_id || lineName,
              buyer: rawActual.work_orders?.buyer || rawActual.buyer || buyer,
              style: rawActual.work_orders?.style || rawActual.style || style,
              po_number: rawActual.work_orders?.po_number || rawActual.po_no || poNumber,
              colour: rawActual.colour || null,
              order_qty: rawActual.order_qty || selectedSubmission.order_qty,
              submitted_at: rawActual.submitted_at,
              man_power: rawActual.man_power,
              marker_capacity: rawActual.marker_capacity,
              lay_capacity: rawActual.lay_capacity,
              cutting_capacity: rawActual.cutting_capacity,
              under_qty: rawActual.under_qty,
              day_cutting: rawActual.day_cutting,
              day_input: rawActual.day_input,
              total_cutting: rawActual.total_cutting,
              total_input: rawActual.total_input,
              balance: rawActual.balance,
              ot_hours_actual: rawActual.ot_hours_actual ?? null,
              ot_manpower_actual: rawActual.ot_manpower_actual ?? null,
              hours_actual: rawActual.hours_actual ?? null,
              actual_per_hour: rawActual.actual_per_hour ?? null,
              leftover_recorded: rawActual.leftover_recorded,
              leftover_type: rawActual.leftover_type,
              leftover_unit: rawActual.leftover_unit,
              leftover_quantity: rawActual.leftover_quantity,
              leftover_notes: rawActual.leftover_notes,
              leftover_location: rawActual.leftover_location,
              leftover_photo_urls: rawActual.leftover_photo_urls,
            } : null}
            open={!!selectedSubmission}
            onOpenChange={(open) => !open && setSelectedSubmission(null)}
            onEditTarget={isAdmin && rawTarget ? () => {
              setEditingTarget(rawTarget);
              setSelectedSubmission(null);
            } : undefined}
            onEditActual={isAdmin && rawActual ? () => {
              setEditingActual(rawActual);
              setSelectedSubmission(null);
            } : undefined}
            onDeleteTarget={isAdmin && rawTarget ? () => fetchData() : undefined}
            onDeleteActual={isAdmin && rawActual ? () => fetchData() : undefined}
          />
        );
      })()}

      {/* Cutting Edit Modals */}
      <EditCuttingTargetModal
        target={editingTarget}
        open={!!editingTarget}
        onOpenChange={(open) => !open && setEditingTarget(null)}
        onSaved={fetchData}
      />
      <EditCuttingActualModal
        submission={editingActual}
        open={!!editingActual}
        onOpenChange={(open) => !open && setEditingActual(null)}
        onSaved={fetchData}
      />
    </div>
  );
}
