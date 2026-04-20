import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sortByLineName } from "@/lib/sort-lines";
import { differenceInDays, parseISO, startOfDay } from "date-fns";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

export interface ScheduleEntry {
  id: string;
  factory_id: string;
  work_order_id: string;
  line_id: string;
  start_date: string;
  end_date: string;
  status: "not_started" | "in_progress" | "completed" | "delayed";
  target_qty: number | null;
  daily_target: number | null;
  priority: number;
  colour: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  item: string | null;
  color: string | null;
  order_qty: number;
  planned_ex_factory: string | null;
  actual_ex_factory: string | null;
  status: string | null;
  is_active: boolean | null;
  line_id: string | null;
  smv: number | null;
  target_per_day: number | null;
}

export interface FactoryLine {
  id: string;
  line_id: string;
  name: string | null;
  is_active: boolean | null;
  target_per_day: number | null;
}

export interface ScheduleWithDetails extends ScheduleEntry {
  workOrder: WorkOrder;
  line: FactoryLine;
}

export type UrgencyGroup = "at_risk" | "upcoming" | "later";

export interface UnscheduledPO extends WorkOrder {
  urgency: UrgencyGroup;
  daysToExFactory: number | null;
}

export interface ExFactoryDeadline {
  date: string;
  workOrders: { id: string; po_number: string; buyer: string; style: string; order_qty: number; isScheduled: boolean }[];
}

export interface ScheduleFormData {
  id?: string;
  work_order_id: string;
  line_id: string;
  start_date: string;
  end_date: string;
  target_qty?: number | null;
  daily_target?: number | null;
  notes?: string | null;
}

export interface ScheduleKPIs {
  scheduledCount: number;
  unscheduledCount: number;
  linesInUse: number;
  idleLines: number;
  exFactoryRisks: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function classifyUrgency(wo: WorkOrder, today: Date): { urgency: UrgencyGroup; daysToExFactory: number | null } {
  if (!wo.planned_ex_factory) return { urgency: "later", daysToExFactory: null };
  const exDate = parseISO(wo.planned_ex_factory);
  const days = differenceInDays(exDate, today);
  if (days <= 14) return { urgency: "at_risk", daysToExFactory: days };
  if (days <= 30) return { urgency: "upcoming", daysToExFactory: days };
  return { urgency: "later", daysToExFactory: days };
}

// ── Hook ───────────────────────────────────────────────────────────────

interface UseProductionScheduleOptions {
  visibleRange: { start: Date; end: Date };
  filters?: {
    lineId?: string;
    buyer?: string;
    riskOnly?: boolean;
    search?: string;
  };
}

export function useProductionSchedule({ visibleRange, filters }: UseProductionScheduleOptions) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const factoryId = profile?.factory_id;

  // ── Queries ──────────────────────────────────────────────────────────

  const schedulesQuery = useQuery({
    queryKey: ["production_schedule", factoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_schedule" as any)
        .select("*")
        .eq("factory_id", factoryId!);
      if (error) throw error;
      return (data ?? []) as ScheduleEntry[];
    },
    enabled: !!factoryId,
  });

  const workOrdersQuery = useQuery({
    queryKey: ["work_orders_schedule", factoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, po_number, buyer, style, item, color, order_qty, planned_ex_factory, actual_ex_factory, status, is_active, line_id, smv, target_per_day")
        .eq("factory_id", factoryId!)
        .eq("is_active", true)
        .neq("status", "deleted");
      if (error) throw error;
      return (data ?? []) as WorkOrder[];
    },
    enabled: !!factoryId,
  });

  const linesQuery = useQuery({
    queryKey: ["lines_schedule", factoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lines")
        .select("id, line_id, name, is_active, target_per_day")
        .eq("factory_id", factoryId!)
        .eq("is_active", true);
      if (error) throw error;
      return sortByLineName((data ?? []) as FactoryLine[], (l) => l.line_id);
    },
    enabled: !!factoryId,
  });

  // ── Derived State ────────────────────────────────────────────────────

  const today = useMemo(() => startOfDay(new Date()), []);

  const schedulesWithDetails: ScheduleWithDetails[] = useMemo(() => {
    if (!schedulesQuery.data || !workOrdersQuery.data || !linesQuery.data) return [];
    const woMap = new Map(workOrdersQuery.data.map((w) => [w.id, w]));
    const lineMap = new Map(linesQuery.data.map((l) => [l.id, l]));

    return schedulesQuery.data
      .map((s) => {
        const workOrder = woMap.get(s.work_order_id);
        const line = lineMap.get(s.line_id);
        if (!workOrder || !line) return null;
        return { ...s, workOrder, line } as ScheduleWithDetails;
      })
      .filter(Boolean) as ScheduleWithDetails[];
  }, [schedulesQuery.data, workOrdersQuery.data, linesQuery.data]);

  // Filter schedules for visible range
  const visibleSchedules = useMemo(() => {
    return schedulesWithDetails.filter((s) => {
      const start = parseISO(s.start_date);
      const end = parseISO(s.end_date);
      const overlaps = start <= visibleRange.end && end >= visibleRange.start;
      if (!overlaps) return false;

      if (filters?.lineId && s.line_id !== filters.lineId) return false;
      if (filters?.buyer && s.workOrder.buyer !== filters.buyer) return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        if (
          !s.workOrder.po_number.toLowerCase().includes(q) &&
          !s.workOrder.buyer.toLowerCase().includes(q) &&
          !s.workOrder.style.toLowerCase().includes(q)
        ) return false;
      }
      if (filters?.riskOnly) {
        const exFactory = s.workOrder.planned_ex_factory;
        if (!exFactory) return false;
        if (parseISO(s.end_date) <= parseISO(exFactory)) return false;
      }
      return true;
    });
  }, [schedulesWithDetails, visibleRange, filters]);

  // Unscheduled POs
  const scheduledWoIds = useMemo(
    () => new Set(schedulesQuery.data?.map((s) => s.work_order_id) ?? []),
    [schedulesQuery.data]
  );

  const unscheduledPOs: UnscheduledPO[] = useMemo(() => {
    if (!workOrdersQuery.data) return [];
    return workOrdersQuery.data
      .filter((wo) => !scheduledWoIds.has(wo.id))
      .map((wo) => ({ ...wo, ...classifyUrgency(wo, today) }))
      .sort((a, b) => {
        const groupOrder: Record<UrgencyGroup, number> = { at_risk: 0, upcoming: 1, later: 2 };
        const gDiff = groupOrder[a.urgency] - groupOrder[b.urgency];
        if (gDiff !== 0) return gDiff;
        if (a.daysToExFactory === null) return 1;
        if (b.daysToExFactory === null) return -1;
        return a.daysToExFactory - b.daysToExFactory;
      });
  }, [workOrdersQuery.data, scheduledWoIds, today]);

  // KPIs
  const kpis: ScheduleKPIs = useMemo(() => {
    const lines = linesQuery.data ?? [];
    const linesWithSchedule = new Set(
      visibleSchedules
        .filter((s) => s.status !== "completed")
        .map((s) => s.line_id)
    );
    const activeLineCount = lines.length;

    const riskyCount = schedulesWithDetails.filter((s) => {
      if (s.status === "completed") return false;
      if (!s.workOrder.planned_ex_factory) return false;
      return parseISO(s.end_date) > parseISO(s.workOrder.planned_ex_factory);
    }).length;

    return {
      scheduledCount: scheduledWoIds.size,
      unscheduledCount: unscheduledPOs.length,
      linesInUse: linesWithSchedule.size,
      idleLines: activeLineCount - linesWithSchedule.size,
      exFactoryRisks: riskyCount,
    };
  }, [visibleSchedules, linesQuery.data, scheduledWoIds, unscheduledPOs, schedulesWithDetails]);

  // Group schedules by line for timeline rendering
  const schedulesByLine = useMemo(() => {
    const map = new Map<string, ScheduleWithDetails[]>();
    for (const s of visibleSchedules) {
      const list = map.get(s.line_id) ?? [];
      list.push(s);
      map.set(s.line_id, list);
    }
    return map;
  }, [visibleSchedules]);

  // Unique buyers for filter dropdown
  const buyers = useMemo(() => {
    const set = new Set(workOrdersQuery.data?.map((w) => w.buyer) ?? []);
    return Array.from(set).sort();
  }, [workOrdersQuery.data]);

  // Ex-factory deadlines grouped by date (for deadline strip)
  const deadlines: ExFactoryDeadline[] = useMemo(() => {
    if (!workOrdersQuery.data) return [];
    const byDate = new Map<string, ExFactoryDeadline["workOrders"]>();
    for (const wo of workOrdersQuery.data) {
      if (!wo.planned_ex_factory) continue;
      const list = byDate.get(wo.planned_ex_factory) ?? [];
      list.push({
        id: wo.id,
        po_number: wo.po_number,
        buyer: wo.buyer,
        style: wo.style,
        order_qty: wo.order_qty,
        isScheduled: scheduledWoIds.has(wo.id),
      });
      byDate.set(wo.planned_ex_factory, list);
    }
    return Array.from(byDate.entries())
      .map(([date, workOrders]) => ({ date, workOrders }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [workOrdersQuery.data, scheduledWoIds]);

  // ── Mutations ────────────────────────────────────────────────────────

  const createSchedule = useMutation({
    mutationFn: async (data: ScheduleFormData) => {
      const { error } = await supabase.from("production_schedule" as any).insert({
        ...data,
        factory_id: factoryId!,
        created_by: profile?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_schedule"] });
      toast.success("PO scheduled successfully");
    },
    onError: (err: any) => {
      toast.error(`Failed to schedule: ${err.message}`);
    },
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, ...data }: ScheduleFormData & { id: string }) => {
      const { error } = await supabase
        .from("production_schedule" as any)
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_schedule"] });
      toast.success("Schedule updated");
    },
    onError: (err: any) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("production_schedule" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_schedule"] });
      toast.success("Schedule removed");
    },
    onError: (err: any) => {
      toast.error(`Failed to remove: ${err.message}`);
    },
  });

  // ── Return ───────────────────────────────────────────────────────────

  const isLoading = schedulesQuery.isLoading || workOrdersQuery.isLoading || linesQuery.isLoading;

  return {
    lines: linesQuery.data ?? [],
    schedulesByLine,
    visibleSchedules,
    unscheduledPOs,
    schedulesWithDetails,
    deadlines,
    buyers,
    kpis,
    isLoading,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  };
}
