import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBuyerPOAccess } from "@/hooks/useBuyerPOAccess";
import { Card, CardContent } from "@/components/ui/card";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FileText, Download, Calendar as CalendarIcon, RefreshCw, TrendingUp, PackageCheck, AlertTriangle } from "lucide-react";
import { format, subDays } from "date-fns";
import { formatShortDate, formatTimeInTimezone } from "@/lib/date-utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { motion } from "framer-motion";

type Department = "all" | "sewing" | "cutting" | "finishing";

interface SubmissionRow {
  id: string;
  department: Department;
  po_number: string;
  style: string;
  production_date: string;
  output: number;
  reject: number;
  cumulative: number;
  submitted_at: string | null;
}

export default function BuyerSubmissions() {
  const { factory } = useAuth();
  const { workOrderIds, workOrders, loading: accessLoading } = useBuyerPOAccess();

  const timezone = factory?.timezone || "Asia/Dhaka";

  const [poFilter, setPoFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<Department>("all");
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const dateFromStr = format(dateFrom, "yyyy-MM-dd");
  const dateToStr = format(dateTo, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (workOrderIds.length === 0) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const filterIds = poFilter === "all" ? workOrderIds : [poFilter];
    const allRows: SubmissionRow[] = [];

    const shouldFetch = (dept: Department) =>
      deptFilter === "all" || deptFilter === dept;

    const [sewingRes, cuttingRes, finishingRes] = await Promise.all([
      shouldFetch("sewing")
        ? supabase
            .from("sewing_actuals")
            .select("id, production_date, good_today, reject_today, cumulative_good_total, submitted_at, work_orders(po_number, style)")
            .in("work_order_id", filterIds)
            .gte("production_date", dateFromStr)
            .lte("production_date", dateToStr)
            .order("production_date", { ascending: false })
        : Promise.resolve({ data: null }),
      shouldFetch("cutting")
        ? supabase
            .from("cutting_actuals")
            .select("id, production_date, day_cutting, day_input, total_input, submitted_at, work_orders(po_number, style)")
            .in("work_order_id", filterIds)
            .gte("production_date", dateFromStr)
            .lte("production_date", dateToStr)
            .order("production_date", { ascending: false })
        : Promise.resolve({ data: null }),
      shouldFetch("finishing")
        ? supabase
            .from("finishing_actuals")
            .select("id, production_date, day_carton, day_poly, day_qc_pass, total_carton, submitted_at, work_orders(po_number, style)")
            .in("work_order_id", filterIds)
            .gte("production_date", dateFromStr)
            .lte("production_date", dateToStr)
            .order("production_date", { ascending: false })
        : Promise.resolve({ data: null }),
    ]);

    // Map sewing
    for (const r of (sewingRes.data as any[]) || []) {
      allRows.push({
        id: r.id,
        department: "sewing",
        po_number: r.work_orders?.po_number || "—",
        style: r.work_orders?.style || "—",
        production_date: r.production_date,
        output: r.good_today || 0,
        reject: r.reject_today || 0,
        cumulative: r.cumulative_good_total || 0,
        submitted_at: r.submitted_at,
      });
    }

    // Map cutting
    for (const r of (cuttingRes.data as any[]) || []) {
      allRows.push({
        id: r.id,
        department: "cutting",
        po_number: r.work_orders?.po_number || "—",
        style: r.work_orders?.style || "—",
        production_date: r.production_date,
        output: r.day_input || 0,
        reject: 0,
        cumulative: r.total_input || 0,
        submitted_at: r.submitted_at,
      });
    }

    // Map finishing
    for (const r of (finishingRes.data as any[]) || []) {
      allRows.push({
        id: r.id,
        department: "finishing",
        po_number: r.work_orders?.po_number || "—",
        style: r.work_orders?.style || "—",
        production_date: r.production_date,
        output: (r.day_carton || 0) + (r.day_poly || 0),
        reject: 0,
        cumulative: r.total_carton || 0,
        submitted_at: r.submitted_at,
      });
    }

    // Sort by date descending
    allRows.sort((a, b) => b.production_date.localeCompare(a.production_date));

    setRows(allRows);
    setDataLoading(false);
  }, [workOrderIds, poFilter, deptFilter, dateFromStr, dateToStr]);

  useEffect(() => {
    if (!accessLoading) fetchData();
  }, [accessLoading, fetchData]);

  const loading = accessLoading || dataLoading;

  const deptColors: Record<Department, string> = {
    all: "",
    sewing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    cutting: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    finishing: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  };

  // Summary stats
  const summary = useMemo(() => {
    const totalOutput = rows.reduce((s, r) => s + r.output, 0);
    const totalReject = rows.reduce((s, r) => s + r.reject, 0);
    const bySewing = rows.filter(r => r.department === "sewing").length;
    const byCutting = rows.filter(r => r.department === "cutting").length;
    const byFinishing = rows.filter(r => r.department === "finishing").length;
    return { totalOutput, totalReject, bySewing, byCutting, byFinishing };
  }, [rows]);

  const handleExportCSV = async () => {
    if (rows.length === 0) return;

    const headers = ["Date", "PO", "Style", "Department", "Output", "Reject", "Cumulative", "Submitted At"];
    const csvRows = rows.map((r) => [
      r.production_date,
      r.po_number,
      r.style,
      r.department,
      r.output,
      r.reject,
      r.cumulative,
      r.submitted_at || "",
    ]);

    const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csv], { type: "text/csv" });
    await downloadFile(blob, `buyer-submissions-${dateFromStr}-to-${dateToStr}.csv`);
  };

  return (
    <motion.div
      className="py-4 lg:py-6 space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">All Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Historical production data for your assigned POs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={poFilter} onValueChange={setPoFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by PO" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All POs</SelectItem>
            {workOrders.map((wo) => (
              <SelectItem key={wo.id} value={wo.id}>
                {wo.po_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v as Department)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            <SelectItem value="sewing">Sewing</SelectItem>
            <SelectItem value="cutting">Cutting</SelectItem>
            <SelectItem value="finishing">Finishing</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(dateFrom, "MMM d")} — {format(dateTo, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">From</p>
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => d && setDateFrom(d)}
                  disabled={(date) => date > dateTo || date > new Date()}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">To</p>
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => d && setDateTo(d)}
                  disabled={(date) => date < dateFrom || date > new Date()}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton columns={7} rows={8} headers={["Date", "PO", "Style", "Dept", "Output", "Reject", "Cumulative"]} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Submissions Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No submissions match the selected filters. Try adjusting the date range or PO filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-muted-foreground">
              {rows.length} submission{rows.length !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Output: <span className="font-medium text-foreground">{summary.totalOutput.toLocaleString()}</span>
            </span>
            {summary.totalReject > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Rejects: <span className="font-medium text-amber-600">{summary.totalReject.toLocaleString()}</span>
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              Sewing: {summary.bySewing} | Cutting: {summary.byCutting} | Finishing: {summary.byFinishing}
            </span>
          </div>

          {/* Scrollable table with sticky header */}
          <div className="rounded-md border overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Reject</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.department}-${row.id}`} className="hover:bg-muted/50 transition-colors">
                    <TableCell>{formatShortDate(row.production_date)}</TableCell>
                    <TableCell className="font-medium">{row.po_number}</TableCell>
                    <TableCell>{row.style}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={deptColors[row.department]}>
                        {row.department}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.output.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.reject > 0 ? (
                        <span className="text-amber-600">{row.reject}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.cumulative.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.submitted_at
                        ? formatTimeInTimezone(row.submitted_at, timezone)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </motion.div>
  );
}
