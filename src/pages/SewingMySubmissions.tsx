import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import { FileText, Target, TrendingUp, Search, Users, Crosshair, ClipboardCheck, Pencil, Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TargetDetailModal } from "@/components/TargetDetailModal";
import { SubmissionDetailModal } from "@/components/SubmissionDetailModal";
import { SewingSubmissionView, SewingTargetData, SewingActualData } from "@/components/SewingSubmissionView";
import { EditSewingTargetModal } from "@/components/EditSewingTargetModal";
import { EditSewingActualModal } from "@/components/EditSewingActualModal";
import { useEditPermission } from "@/hooks/useEditPermission";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SewingTarget {
  id: string;
  production_date: string;
  per_hour_target: number;
  manpower_planned: number;
  ot_hours_planned: number;
  hours_planned: number | null;
  target_total_planned: number | null;
  work_order_id: string;
  line_id: string;
  is_late: boolean | null;
  submitted_at: string | null;
  line: {
    line_id: string;
    name: string | null;
  } | null;
  work_order: {
    po_number: string;
    style: string;
    buyer: string;
    order_qty: number;
  } | null;
}

interface SewingActual {
  id: string;
  production_date: string;
  good_today: number;
  reject_today: number;
  rework_today: number;
  manpower_actual: number;
  ot_hours_actual: number;
  ot_manpower_actual: number;
  hours_actual: number | null;
  actual_per_hour: number | null;
  cumulative_good_total: number;
  work_order_id: string;
  line_id: string;
  submitted_at: string | null;
  line: {
    line_id: string;
    name: string | null;
  } | null;
  work_order: {
    po_number: string;
    style: string;
    buyer: string;
    order_qty: number;
  } | null;
}

export default function SewingMySubmissions() {
  const navigate = useNavigate();
  const { profile, user, factory } = useAuth();
  const { canEditSubmission, getTimeUntilCutoff } = useEditPermission();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<SewingTarget[]>([]);
  const [actuals, setActuals] = useState<SewingActual[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("targets");
  const [selectedTarget, setSelectedTarget] = useState<SewingTarget | null>(null);
  const [selectedActual, setSelectedActual] = useState<SewingActual | null>(null);
  const [editingTarget, setEditingTarget] = useState<SewingTarget | null>(null);
  const [editingActual, setEditingActual] = useState<SewingActual | null>(null);
  
  const timeUntilCutoff = getTimeUntilCutoff();

  useEffect(() => {
    if (profile?.factory_id && user) {
      fetchMySubmissions();
    }
  }, [profile?.factory_id, user]);

  const fetchMySubmissions = async () => {
    try {
      // Fetch targets created by current user
      const { data: targetsData, error: targetsError } = await supabase
        .from("sewing_targets")
        .select(`
          id,
          production_date,
          per_hour_target,
          manpower_planned,
          ot_hours_planned,
          hours_planned,
          target_total_planned,
          work_order_id,
          line_id,
          is_late,
          submitted_at,
          line:lines(line_id, name),
          work_order:work_orders(po_number, style, buyer, order_qty)
        `)
        .eq("factory_id", profile!.factory_id!)
        .eq("submitted_by", user!.id)
        .order("production_date", { ascending: false })
        .order("submitted_at", { ascending: false });

      if (targetsError) throw targetsError;

      // Fetch actuals created by current user
      const { data: actualsData, error: actualsError } = await supabase
        .from("sewing_actuals")
        .select(`
          id,
          production_date,
          good_today,
          reject_today,
          rework_today,
          manpower_actual,
          ot_hours_actual,
          ot_manpower_actual,
          hours_actual,
          actual_per_hour,
          cumulative_good_total,
          work_order_id,
          line_id,
          submitted_at,
          line:lines(line_id, name),
          work_order:work_orders(po_number, style, buyer, order_qty)
        `)
        .eq("factory_id", profile!.factory_id!)
        .eq("submitted_by", user!.id)
        .order("production_date", { ascending: false })
        .order("submitted_at", { ascending: false });

      if (actualsError) throw actualsError;

      setTargets((targetsData as SewingTarget[]) || []);
      setActuals((actualsData as SewingActual[]) || []);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const targetsThisWeek = targets.filter((t) =>
      isWithinInterval(parseISO(t.production_date), { start: weekStart, end: weekEnd })
    ).length;

    const actualsThisWeek = actuals.filter((a) =>
      isWithinInterval(parseISO(a.production_date), { start: weekStart, end: weekEnd })
    ).length;

    const totalGoodOutput = actuals.reduce((sum, a) => sum + (a.good_today || 0), 0);
    const avgTarget = targets.length > 0 
      ? Math.round(targets.reduce((sum, t) => sum + (t.per_hour_target || 0), 0) / targets.length) 
      : 0;

    return {
      targetsThisWeek,
      actualsThisWeek,
      totalGoodOutput,
      avgTarget,
    };
  }, [targets, actuals]);

  // Filter function
  const filterData = <T extends { production_date: string; line?: { line_id?: string; name?: string | null } | null; work_order?: { po_number?: string; style?: string; buyer?: string } | null }>(data: T[]) => {
    let result = data;

    // Date filter
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

    // Search filter
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
  };

  const filteredTargets = useMemo(() => filterData(targets), [targets, dateFilter, searchQuery]);
  const filteredActuals = useMemo(() => filterData(actuals), [actuals, dateFilter, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">My Sewing Submissions</h1>
        </div>
        {timeUntilCutoff && (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Edit window: {timeUntilCutoff}
          </Badge>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Crosshair className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Targets This Week</p>
                <p className="text-2xl font-bold">{stats.targetsThisWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End of Day This Week</p>
                <p className="text-2xl font-bold">{stats.actualsThisWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Per Hour Target</p>
                <p className="text-2xl font-bold">{stats.avgTarget.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Good Output</p>
                <p className="text-2xl font-bold">{stats.totalGoodOutput.toLocaleString()}</p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-auto inline-flex">
          <TabsTrigger value="targets" className="gap-2">
            <Crosshair className="h-4 w-4" />
            Morning Targets
            <Badge variant="secondary">{filteredTargets.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="actuals" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            End of Day
            <Badge variant="secondary">{filteredActuals.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="targets">
          <Card>
            <CardHeader>
              <CardTitle>Morning Targets</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredTargets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Crosshair className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No targets found</p>
                  <p className="text-sm mt-2">
                    {searchQuery || dateFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Submit morning targets to start tracking"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>PO / Style</TableHead>
                      <TableHead className="text-right">Target/Hr</TableHead>
                      <TableHead className="text-right">Manpower</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTargets.map((target) => {
                      const date = parseISO(target.production_date);
                      const isTodayItem = isTodayInTimezone(target.production_date, factory?.timezone || "Asia/Dhaka");
                      const editCheck = canEditSubmission(target.production_date);

                      return (
                        <TableRow 
                          key={target.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedTarget(target)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{format(date, "MMM dd")}</span>
                              {isTodayItem && (
                                <Badge variant="secondary" className="text-xs">
                                  Today
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {target.submitted_at
                              ? format(parseISO(target.submitted_at), "hh:mm a")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {target.line?.line_id || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {target.work_order?.po_number || "—"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {target.work_order?.style || "—"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {target.per_hour_target}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {target.manpower_planned}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={target.is_late ? "destructive" : "default"}>
                              {target.is_late ? "Late" : "On Time"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {editCheck.canEdit && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTarget(target);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit submission</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actuals">
          <Card>
            <CardHeader>
              <CardTitle>End of Day Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredActuals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No end of day reports found</p>
                  <p className="text-sm mt-2">
                    {searchQuery || dateFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Submit end of day reports to track actual production"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>PO / Style</TableHead>
                      <TableHead className="text-right">Good</TableHead>
                      <TableHead className="text-right">Reject</TableHead>
                      <TableHead className="text-right">Rework</TableHead>
                      <TableHead className="text-right">Cumulative</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActuals.map((actual) => {
                      const date = parseISO(actual.production_date);
                      const isTodayItem = isTodayInTimezone(actual.production_date, factory?.timezone || "Asia/Dhaka");
                      const editCheck = canEditSubmission(actual.production_date);

                      return (
                        <TableRow 
                          key={actual.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedActual(actual)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{format(date, "MMM dd")}</span>
                              {isTodayItem && (
                                <Badge variant="secondary" className="text-xs">
                                  Today
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {actual.submitted_at
                              ? format(parseISO(actual.submitted_at), "hh:mm a")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {actual.line?.line_id || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {actual.work_order?.po_number || "—"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {actual.work_order?.style || "—"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {actual.good_today}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {actual.reject_today}
                          </TableCell>
                          <TableCell className="text-right text-amber-600">
                            {actual.rework_today}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {actual.cumulative_good_total.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {editCheck.canEdit && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingActual(actual);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit submission</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sewing Submission View (Target) */}
      {(() => {
        if (!selectedTarget) return null;
        const t = selectedTarget;
        const sewingTarget: SewingTargetData = {
          id: t.id,
          production_date: t.production_date,
          line_name: t.line?.name || t.line?.line_id || 'Unknown Line',
          po_number: t.work_order?.po_number || null,
          buyer: t.work_order?.buyer || null,
          style: t.work_order?.style || null,
          order_qty: t.work_order?.order_qty ?? null,
          submitted_at: t.submitted_at,
          per_hour_target: t.per_hour_target,
          manpower_planned: t.manpower_planned,
          ot_hours_planned: t.ot_hours_planned,
          hours_planned: t.hours_planned ?? null,
          target_total_planned: t.target_total_planned ?? null,
          stage_name: null,
          planned_stage_progress: null,
          next_milestone: null,
          estimated_ex_factory: null,
          remarks: null,
        };
        const ma = actuals.find(a =>
          a.line_id === t.line_id && a.work_order_id === t.work_order_id && a.production_date === t.production_date
        );
        const sewingActual: SewingActualData | null = ma ? {
          id: ma.id,
          production_date: ma.production_date,
          line_name: ma.line?.name || ma.line?.line_id || 'Unknown Line',
          po_number: ma.work_order?.po_number || null,
          buyer: ma.work_order?.buyer || null,
          style: ma.work_order?.style || null,
          order_qty: ma.work_order?.order_qty ?? null,
          submitted_at: ma.submitted_at,
          good_today: ma.good_today,
          reject_today: ma.reject_today,
          rework_today: ma.rework_today,
          cumulative_good_total: ma.cumulative_good_total,
          manpower_actual: ma.manpower_actual,
          ot_hours_actual: ma.ot_hours_actual,
          ot_manpower_actual: ma.ot_manpower_actual ?? null,
          hours_actual: ma.hours_actual ?? null,
          actual_per_hour: ma.actual_per_hour ?? null,
          stage_name: null,
          actual_stage_progress: null,
          remarks: null,
          has_blocker: null,
          blocker_description: null,
          blocker_impact: null,
          blocker_owner: null,
           blocker_status: null,
           estimated_cost_value: null,
           estimated_cost_currency: null,
         } : null;
        return (
          <SewingSubmissionView
            target={sewingTarget}
            actual={sewingActual}
            open={!!selectedTarget}
            onOpenChange={(open) => !open && setSelectedTarget(null)}
          />
        );
      })()}

      {/* Sewing Submission View (Actual) */}
      {(() => {
        if (!selectedActual) return null;
        const a = selectedActual;
        const sewingActual: SewingActualData = {
          id: a.id,
          production_date: a.production_date,
          line_name: a.line?.name || a.line?.line_id || 'Unknown Line',
          po_number: a.work_order?.po_number || null,
          buyer: a.work_order?.buyer || null,
          style: a.work_order?.style || null,
          order_qty: a.work_order?.order_qty ?? null,
          submitted_at: a.submitted_at,
          good_today: a.good_today,
          reject_today: a.reject_today,
          rework_today: a.rework_today,
          cumulative_good_total: a.cumulative_good_total,
          manpower_actual: a.manpower_actual,
          ot_hours_actual: a.ot_hours_actual,
          ot_manpower_actual: a.ot_manpower_actual ?? null,
          hours_actual: a.hours_actual ?? null,
          actual_per_hour: a.actual_per_hour ?? null,
          stage_name: null,
          actual_stage_progress: null,
          remarks: null,
          has_blocker: null,
          blocker_description: null,
          blocker_impact: null,
          blocker_owner: null,
           blocker_status: null,
           estimated_cost_value: a.estimated_cost_value ?? null,
           estimated_cost_currency: a.estimated_cost_currency ?? null,
         };
        const mt = targets.find(t =>
          t.line_id === a.line_id && t.work_order_id === a.work_order_id && t.production_date === a.production_date
        );
        const sewingTarget: SewingTargetData | null = mt ? {
          id: mt.id,
          production_date: mt.production_date,
          line_name: mt.line?.name || mt.line?.line_id || 'Unknown Line',
          po_number: mt.work_order?.po_number || null,
          buyer: mt.work_order?.buyer || null,
          style: mt.work_order?.style || null,
          order_qty: mt.work_order?.order_qty ?? null,
          submitted_at: mt.submitted_at,
          per_hour_target: mt.per_hour_target,
          manpower_planned: mt.manpower_planned,
          ot_hours_planned: mt.ot_hours_planned,
          hours_planned: mt.hours_planned ?? null,
          target_total_planned: mt.target_total_planned ?? null,
          stage_name: null,
          planned_stage_progress: null,
          next_milestone: null,
          estimated_ex_factory: null,
          remarks: null,
        } : null;
        return (
          <SewingSubmissionView
            target={sewingTarget}
            actual={sewingActual}
            open={!!selectedActual}
            onOpenChange={(open) => !open && setSelectedActual(null)}
          />
        );
      })()}

      {/* Edit Target Modal */}
      <EditSewingTargetModal
        target={editingTarget}
        open={!!editingTarget}
        onOpenChange={(open) => !open && setEditingTarget(null)}
        onSaved={fetchMySubmissions}
      />

      {/* Edit Actual Modal */}
      <EditSewingActualModal
        submission={editingActual}
        open={!!editingActual}
        onOpenChange={(open) => !open && setEditingActual(null)}
        onSaved={fetchMySubmissions}
      />
    </div>
  );
}
