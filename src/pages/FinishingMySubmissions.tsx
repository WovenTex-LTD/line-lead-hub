import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { isTodayInTimezone } from "@/lib/date-utils";
import { FileText, Clock, Target, TrendingUp, Search, Package, Edit2, Eye } from "lucide-react";
import { FinishingSubmissionView, FinishingTargetData, FinishingActualData } from "@/components/FinishingSubmissionView";
import { useEditPermission } from "@/hooks/useEditPermission";

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
  m_power_planned: number | null;
  m_power_actual: number | null;
  planned_hours: number | null;
  actual_hours: number | null;
  ot_hours_planned: number | null;
  ot_manpower_planned: number | null;
  ot_hours_actual: number | null;
  ot_manpower_actual: number | null;
  remarks: string | null;
  submitted_at: string;
  is_locked: boolean;
  line: {
    line_id: string;
    name: string | null;
  } | null;
  work_order: {
    po_number: string;
    style: string;
    buyer: string;
    planned_ex_factory: string | null;
  } | null;
}

export default function FinishingMySubmissions() {
  const navigate = useNavigate();
  const { profile, user, factory } = useAuth();
  const { getTimeUntilCutoff } = useEditPermission();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<FinishingDailyLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"targets" | "outputs">("targets");
  const [selectedLog, setSelectedLog] = useState<FinishingDailyLog | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const timeUntilCutoff = getTimeUntilCutoff();

  useEffect(() => {
    if (profile?.factory_id && user) {
      fetchMySubmissions();
    }
  }, [profile?.factory_id, user]);

  const fetchMySubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from("finishing_daily_logs")
        .select(`
          *,
          line:lines(line_id, name),
          work_order:work_orders(po_number, style, buyer, planned_ex_factory)
        `)
        .eq("factory_id", profile!.factory_id!)
        .eq("submitted_by", user!.id)
        .order("production_date", { ascending: false })
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      setLogs(data as FinishingDailyLog[]);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setLoading(false);
    }
  };

  // Split logs by type
  const targets = useMemo(() => logs.filter(l => l.log_type === "TARGET"), [logs]);
  const outputs = useMemo(() => logs.filter(l => l.log_type === "OUTPUT"), [logs]);

  // Calculate stats
  const stats = useMemo(() => {
    const currentLogs = activeTab === "targets" ? targets : outputs;
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const logsThisWeek = currentLogs.filter((log) => {
      const date = parseISO(log.production_date);
      return isWithinInterval(date, { start: weekStart, end: weekEnd });
    });

    // Total output = Poly (primary finishing metric)
    const totalPcs = logsThisWeek.reduce((sum, log) => {
      return sum + log.poly;
    }, 0);

    const avgPerDay = logsThisWeek.length > 0 
      ? Math.round(totalPcs / logsThisWeek.length)
      : 0;

    return {
      submissionsThisWeek: logsThisWeek.length,
      totalPcsThisWeek: totalPcs,
      avgPerDay,
    };
  }, [targets, outputs, activeTab]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    const currentLogs = activeTab === "targets" ? targets : outputs;
    let result = currentLogs;

    if (dateFilter === "today") {
      result = result.filter((item) => isTodayInTimezone(item.production_date, factory?.timezone || "Asia/Dhaka"));
    } else if (dateFilter === "week") {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      result = result.filter((item) =>
        isWithinInterval(parseISO(item.production_date), { start: weekStart, end: weekEnd })
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.work_order?.po_number?.toLowerCase().includes(query) ||
          item.work_order?.style?.toLowerCase().includes(query) ||
          item.work_order?.buyer?.toLowerCase().includes(query) ||
          item.line?.line_id?.toLowerCase().includes(query) ||
          item.line?.name?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [targets, outputs, activeTab, dateFilter, searchQuery]);

  const handleNewSubmission = () => {
    if (activeTab === "targets") {
      navigate("/finishing/daily-target");
    } else {
      navigate("/finishing/daily-output");
    }
  };

  const handleEdit = (log: FinishingDailyLog) => {
    const path = log.log_type === "TARGET" ? "/finishing/daily-target" : "/finishing/daily-output";
    const params = new URLSearchParams();
    if (log.line_id) params.set("line", log.line_id);
    if (log.work_order_id) params.set("wo", log.work_order_id);
    navigate(`${path}?${params.toString()}`);
  };

  const handleView = (log: FinishingDailyLog) => {
    setSelectedLog(log);
    setDetailModalOpen(true);
  };

  const calculateLogTotal = (log: FinishingDailyLog) => {
    return (log.poly || 0);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-5 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">My Submissions</h1>
            <p className="text-sm text-muted-foreground">Your finishing targets and end of day reports</p>
          </div>
        </div>
        {timeUntilCutoff && (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Edit window: {timeUntilCutoff}
          </Badge>
        )}
        <Button onClick={handleNewSubmission}>
          + New {activeTab === "targets" ? "Target" : "Output"}
        </Button>
      </div>

      {/* Tabs for Targets vs Outputs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "targets" | "outputs")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="targets" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Daily Targets ({targets.length})
          </TabsTrigger>
          <TabsTrigger value="outputs" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Daily Outputs ({outputs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-violet-50 via-white to-violet-50/50 border-violet-200/60 dark:border-violet-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">This Week</p>
                    <p className="text-2xl font-bold">{stats.submissionsThisWeek} submissions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-violet-50 via-white to-violet-50/50 border-violet-200/60 dark:border-violet-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Pcs (Week)</p>
                    <p className="text-2xl font-bold">{stats.totalPcsThisWeek.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-violet-50 via-white to-violet-50/50 border-violet-200/60 dark:border-violet-800/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Per Day</p>
                    <p className="text-2xl font-bold">{stats.avgPerDay.toLocaleString()} pcs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by PO, style, buyer, line..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === "targets" ? "Target Submissions" : "Output Submissions"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No {activeTab === "targets" ? "target" : "output"} submissions found</p>
                  <p className="text-sm mt-2">
                    {searchQuery || dateFilter !== "all"
                      ? "Try adjusting your filters"
                      : `Create a new ${activeTab === "targets" ? "target" : "output"} to start`}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>PO / Style</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead className="text-right">Total Pcs</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => {
                        const date = parseISO(log.production_date);
                        const isTodaySubmission = isTodayInTimezone(log.production_date, factory?.timezone || "Asia/Dhaka");
                        const total = calculateLogTotal(log);

                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{format(date, "MMM dd, yyyy")}</span>
                                {isTodaySubmission && (
                                  <Badge variant="secondary" className="text-xs">
                                    Today
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {log.work_order ? (
                                <div>
                                  <div className="font-medium">
                                    {log.work_order.po_number}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {log.work_order.style}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No PO</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.shift ? (
                                <Badge variant="outline">{log.shift}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {total.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleView(log)}
                                  title="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEdit(log)}
                                  disabled={log.is_locked}
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(() => {
        if (!selectedLog) {
          return (
            <FinishingSubmissionView
              target={null}
              actual={null}
              open={detailModalOpen}
              onOpenChange={setDetailModalOpen}
            />
          );
        }

        const counterpart = logs.find(
          (l) =>
            l.log_type !== selectedLog.log_type &&
            l.production_date === selectedLog.production_date &&
            l.work_order_id === selectedLog.work_order_id
        ) ?? null;

        const targetLog = selectedLog.log_type === "TARGET" ? selectedLog : counterpart?.log_type === "TARGET" ? counterpart : null;
        const actualLog = selectedLog.log_type === "OUTPUT" ? selectedLog : counterpart?.log_type === "OUTPUT" ? counterpart : null;

        const target: FinishingTargetData | null = targetLog ? {
          id: targetLog.id,
          production_date: targetLog.production_date,
          submitted_at: targetLog.submitted_at,
          po_number: targetLog.work_order?.po_number ?? null,
          buyer: targetLog.work_order?.buyer ?? null,
          style: targetLog.work_order?.style ?? null,
          planned_ex_factory: targetLog.work_order?.planned_ex_factory ?? null,
          thread_cutting: targetLog.thread_cutting,
          inside_check: targetLog.inside_check,
          top_side_check: targetLog.top_side_check,
          buttoning: targetLog.buttoning,
          iron: targetLog.iron,
          get_up: targetLog.get_up,
          poly: targetLog.poly,
          carton: targetLog.carton,
          m_power_planned: targetLog.m_power_planned ?? null,
          planned_hours: targetLog.planned_hours ?? null,
          ot_hours_planned: targetLog.ot_hours_planned ?? null,
          ot_manpower_planned: targetLog.ot_manpower_planned ?? null,
          remarks: targetLog.remarks ?? null,
        } : null;

        const actual: FinishingActualData | null = actualLog ? {
          id: actualLog.id,
          production_date: actualLog.production_date,
          submitted_at: actualLog.submitted_at,
          po_number: actualLog.work_order?.po_number ?? null,
          buyer: actualLog.work_order?.buyer ?? null,
          style: actualLog.work_order?.style ?? null,
          planned_ex_factory: actualLog.work_order?.planned_ex_factory ?? null,
          thread_cutting: actualLog.thread_cutting,
          inside_check: actualLog.inside_check,
          top_side_check: actualLog.top_side_check,
          buttoning: actualLog.buttoning,
          iron: actualLog.iron,
          get_up: actualLog.get_up,
          poly: actualLog.poly,
          carton: actualLog.carton,
          m_power_actual: actualLog.m_power_actual ?? null,
          actual_hours: actualLog.actual_hours ?? null,
          ot_hours_actual: actualLog.ot_hours_actual ?? null,
          ot_manpower_actual: actualLog.ot_manpower_actual ?? null,
          remarks: actualLog.remarks ?? null,
        } : null;

        return (
          <FinishingSubmissionView
            target={target}
            actual={actual}
            open={detailModalOpen}
            onOpenChange={setDetailModalOpen}
          />
        );
      })()}
    </div>
  );
}
