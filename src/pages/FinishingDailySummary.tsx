import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, Filter, Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Line {
  id: string;
  line_id: string;
  name: string | null;
}

interface FinishingDailyLog {
  id: string;
  production_date: string;
  line_id: string | null;
  work_order_id: string | null;
  log_type: "TARGET" | "OUTPUT";
  shift: string | null;
  thread_cutting: number;
  inside_check: number;
  top_side_check: number;
  buttoning: number;
  iron: number;
  get_up: number;
  poly: number;
  carton: number;
  submitted_at: string;
  line: {
    line_id: string;
    name: string | null;
  } | null;
  work_order: {
    po_number: string;
    style: string;
    buyer: string;
  } | null;
}

const PROCESS_KEYS = [
  "thread_cutting",
  "inside_check", 
  "top_side_check",
  "buttoning",
  "iron",
  "get_up",
  "poly",
  "carton",
] as const;

const PROCESS_LABELS: Record<string, string> = {
  thread_cutting: "Thread Cut",
  inside_check: "Inside Chk",
  top_side_check: "Top Side",
  buttoning: "Button",
  iron: "Iron",
  get_up: "Get-up",
  poly: "Poly",
  carton: "Carton",
};

export default function FinishingDailySummary() {
  const navigate = useNavigate();
  const { profile, isAdminOrHigher } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [logs, setLogs] = useState<FinishingDailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLineId, setSelectedLineId] = useState<string>("all");

  useEffect(() => {
    if (profile?.factory_id) {
      fetchData();
    }
  }, [profile?.factory_id]);

  useEffect(() => {
    if (profile?.factory_id && selectedDate) {
      fetchLogs();
    }
  }, [profile?.factory_id, selectedDate, selectedLineId]);

  async function fetchData() {
    try {
      const { data: linesData } = await supabase
        .from("lines")
        .select("id, line_id, name")
        .eq("factory_id", profile!.factory_id!)
        .eq("is_active", true)
        .order("line_id");

      setLines(linesData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs() {
    try {
      let query = supabase
        .from("finishing_daily_logs")
        .select(`
          *,
          line:lines(line_id, name),
          work_order:work_orders(po_number, style, buyer)
        `)
        .eq("factory_id", profile!.factory_id!)
        .eq("production_date", format(selectedDate, "yyyy-MM-dd"))
        .order("line_id");

      if (selectedLineId !== "all") {
        query = query.eq("line_id", selectedLineId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data as FinishingDailyLog[]);
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  }

  // Group logs by PO for summary view
  const summaryByPO = useMemo(() => {
    const grouped: Record<string, { target: FinishingDailyLog | null; output: FinishingDailyLog | null; work_order: any }> = {};

    logs.forEach((log) => {
      const key = log.work_order_id || 'no-po';
      if (!grouped[key]) {
        grouped[key] = { target: null, output: null, work_order: log.work_order };
      }
      if (log.log_type === "TARGET") {
        grouped[key].target = log;
      } else {
        grouped[key].output = log;
      }
    });

    return Object.entries(grouped).map(([key, data]) => ({
      key,
      ...data,
    }));
  }, [logs]);

  const calculateTotal = (log: FinishingDailyLog | null) => {
    if (!log) return 0;
    // Total output = Poly (primary finishing metric)
    return (log as any).poly || 0;
  };

  const VarianceCell = ({ target, output }: { target: number; output: number }) => {
    const variance = output - target;
    if (variance > 0) {
      return <span className="text-green-600 dark:text-green-400 flex items-center justify-end gap-1">
        <TrendingUp className="h-3 w-3" />+{variance}
      </span>;
    } else if (variance < 0) {
      return <span className="text-destructive flex items-center justify-end gap-1">
        <TrendingDown className="h-3 w-3" />{variance}
      </span>;
    }
    return <span className="text-muted-foreground flex items-center justify-end gap-1">
      <Minus className="h-3 w-3" />0
    </span>;
  };

  const handleExport = async () => {
    // Create CSV content
    const headers = ["PO", "Type", ...PROCESS_KEYS.map(k => PROCESS_LABELS[k]), "Total"];
    const rows = logs.map(log => [
      log.work_order?.po_number || "No PO",
      log.log_type,
      ...PROCESS_KEYS.map(k => (log as any)[k] || 0),
      calculateTotal(log),
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const { downloadFile } = await import("@/lib/capacitor");
    const blob = new Blob([csv], { type: "text/csv" });
    await downloadFile(blob, `finishing-summary-${format(selectedDate, "yyyy-MM-dd")}.csv`);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdminOrHigher()) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <p className="text-muted-foreground">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Daily Finishing Summary</h1>
            <p className="text-sm text-muted-foreground">
              Target vs Output comparison for all lines
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "MMM dd, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Line</label>
              <Select value={selectedLineId} onValueChange={setSelectedLineId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All lines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lines</SelectItem>
                  {lines.map((line) => (
                    <SelectItem key={line.id} value={line.id}>
                      {line.name || line.line_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Summary for {format(selectedDate, "MMMM d, yyyy")}</span>
            <Badge variant="outline">{summaryByPO.length} entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaryByPO.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No submissions found for this date</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">PO</TableHead>
                    <TableHead>Row</TableHead>
                    {PROCESS_KEYS.map((key) => (
                      <TableHead key={key} className="text-right text-xs">
                        {PROCESS_LABELS[key]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryByPO.map(({ key, target, output, work_order }) => (
                    <>
                      {/* Target Row */}
                      <TableRow key={`${key}-target`} className="bg-violet-50/50 dark:bg-violet-950/20">
                        <TableCell className="sticky left-0 bg-violet-50/50 dark:bg-violet-950/20 font-medium" rowSpan={3}>
                          {work_order?.po_number || target?.work_order?.po_number || output?.work_order?.po_number || "No PO"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">Target</Badge>
                        </TableCell>
                        {PROCESS_KEYS.map((pKey) => (
                          <TableCell key={pKey} className="text-right">
                            {target ? (target as any)[pKey] || 0 : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-medium">
                          {target ? calculateTotal(target) : "—"}
                        </TableCell>
                      </TableRow>
                      {/* Output Row */}
                      <TableRow key={`${key}-output`} className="bg-purple-50/50 dark:bg-purple-950/20">
                        <TableCell>
                          <Badge variant="outline" className="text-xs">Output</Badge>
                        </TableCell>
                        {PROCESS_KEYS.map((pKey) => (
                          <TableCell key={pKey} className="text-right">
                            {output ? (output as any)[pKey] || 0 : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-medium">
                          {output ? calculateTotal(output) : "—"}
                        </TableCell>
                      </TableRow>
                      {/* Variance Row */}
                      <TableRow key={`${key}-variance`} className="border-b-2">
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">Variance</Badge>
                        </TableCell>
                        {PROCESS_KEYS.map((pKey) => {
                          const t = target ? (target as any)[pKey] || 0 : 0;
                          const o = output ? (output as any)[pKey] || 0 : 0;
                          return (
                            <TableCell key={pKey} className="text-right text-sm">
                              {target && output ? (
                                <VarianceCell target={t} output={o} />
                              ) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          {target && output ? (
                            <VarianceCell 
                              target={calculateTotal(target)} 
                              output={calculateTotal(output)} 
                            />
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
