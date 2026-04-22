# Schedule Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium production planning page that lets admins assign POs to lines with start/end dates, view a Gantt-style timeline, spot deadline risks, and manage unscheduled orders.

**Architecture:** Line-based timeline planner with sticky unscheduled sidebar. Custom hook (`useProductionSchedule`) centralizes all Supabase queries and mutations. Components follow the Lines.tsx pattern — page is a layout coordinator, logic lives in hooks. Since `production_schedule` table types are not yet in the generated types file, we use explicit TypeScript interfaces.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack React Query, Supabase, date-fns, Lucide icons

---

## File Structure

```
src/pages/Schedule.tsx                          — page layout coordinator
src/hooks/useProductionSchedule.ts              — data fetching, mutations, derived state
src/hooks/useTimelineState.ts                   — timeline view mode, navigation, date range
src/components/schedule/
  ├── ScheduleKPIStrip.tsx                      — 5 KPI summary cards
  ├── ScheduleControls.tsx                      — view toggle, filters, today jump
  ├── TimelinePlanner.tsx                       — main planner container
  │   ├── TimelineHeader.tsx                    — date column headers
  │   ├── TimelineRow.tsx                       — single line row with bars
  │   └── ScheduleBar.tsx                       — single PO schedule bar
  ├── UnscheduledSidebar.tsx                    — sticky sidebar with urgency groups
  │   └── UnscheduledPOCard.tsx                 — single unscheduled PO card
  ├── ScheduleModal.tsx                         — create/edit schedule modal
  └── ScheduleDetailDrawer.tsx                  — inspect schedule right drawer
```

Modify:
- `src/App.tsx` — add lazy import + route
- `src/lib/constants.ts` — add nav item for admin/owner

---

## Task 1: TypeScript Types & Timeline State Hook

**Files:**
- Create: `src/hooks/useTimelineState.ts`

- [ ] **Step 1: Create useTimelineState hook**

This hook manages view mode, current anchor date, navigation, and derived visible range.

```typescript
import { useState, useMemo, useCallback } from "react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, startOfDay } from "date-fns";

export type ViewMode = "week" | "month";

export function useTimelineState() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));

  const visibleRange = useMemo(() => {
    if (viewMode === "week") {
      return {
        start: startOfWeek(anchorDate, { weekStartsOn: 1 }),
        end: endOfWeek(anchorDate, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfMonth(anchorDate),
      end: endOfMonth(anchorDate),
    };
  }, [viewMode, anchorDate]);

  const navigateForward = useCallback(() => {
    setAnchorDate((d) => (viewMode === "week" ? addWeeks(d, 1) : addMonths(d, 1)));
  }, [viewMode]);

  const navigateBack = useCallback(() => {
    setAnchorDate((d) => (viewMode === "week" ? subWeeks(d, 1) : subMonths(d, 1)));
  }, [viewMode]);

  const jumpToToday = useCallback(() => {
    setAnchorDate(startOfDay(new Date()));
  }, []);

  return {
    viewMode,
    setViewMode,
    anchorDate,
    visibleRange,
    navigateForward,
    navigateBack,
    jumpToToday,
  };
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/hooks/useTimelineState.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTimelineState.ts
git commit -m "feat(schedule): add useTimelineState hook for timeline view navigation"
```

---

## Task 2: Data Hook — useProductionSchedule

**Files:**
- Create: `src/hooks/useProductionSchedule.ts`

- [ ] **Step 1: Create the data hook**

```typescript
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sortByLineName } from "@/lib/sort-lines";
import { differenceInDays, parseISO, isWithinInterval, startOfDay } from "date-fns";
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

export interface ScheduleFormData {
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

  const today = startOfDay(new Date());

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
      // Overlaps with visible range
      const overlaps = start <= visibleRange.end && end >= visibleRange.start;
      if (!overlaps) return false;

      // Apply filters
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
    // Data
    lines: linesQuery.data ?? [],
    schedulesByLine,
    visibleSchedules,
    unscheduledPOs,
    schedulesWithDetails,
    buyers,
    kpis,
    // State
    isLoading,
    // Mutations
    createSchedule,
    updateSchedule,
    deleteSchedule,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useProductionSchedule.ts
git commit -m "feat(schedule): add useProductionSchedule data hook with queries, mutations, derived state"
```

---

## Task 3: KPI Strip Component

**Files:**
- Create: `src/components/schedule/ScheduleKPIStrip.tsx`

- [ ] **Step 1: Create the KPI strip**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, AlertTriangle, Activity, Pause, ShieldAlert } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { ScheduleKPIs } from "@/hooks/useProductionSchedule";

interface Props {
  kpis: ScheduleKPIs;
}

const cards = [
  { key: "scheduledCount" as const, label: "Scheduled POs", icon: CalendarCheck, gradient: "from-blue-50 via-white to-blue-50/50", iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  { key: "unscheduledCount" as const, label: "Unscheduled POs", icon: AlertTriangle, gradient: "from-amber-50 via-white to-amber-50/50", iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  { key: "linesInUse" as const, label: "Lines in Use", icon: Activity, gradient: "from-emerald-50 via-white to-emerald-50/50", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  { key: "idleLines" as const, label: "Idle Lines", icon: Pause, gradient: "from-slate-50 via-white to-slate-50/50", iconBg: "bg-slate-100", iconColor: "text-slate-500" },
  { key: "exFactoryRisks" as const, label: "Ex-Factory Risks", icon: ShieldAlert, gradient: "from-red-50 via-white to-red-50/50", iconBg: "bg-red-100", iconColor: "text-red-600" },
];

export function ScheduleKPIStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const value = kpis[card.key];
        return (
          <Card
            key={card.key}
            className={`relative overflow-hidden bg-gradient-to-br ${card.gradient} border-slate-200/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-in`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Decorative blob */}
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br from-slate-100/40 to-transparent" />
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                    <AnimatedNumber value={value} />
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ScheduleKPIStrip.tsx
git commit -m "feat(schedule): add ScheduleKPIStrip component with 5 premium KPI cards"
```

---

## Task 4: Schedule Controls Component

**Files:**
- Create: `src/components/schedule/ScheduleControls.tsx`

- [ ] **Step 1: Create controls component**

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarDays, Search } from "lucide-react";
import { format } from "date-fns";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine } from "@/hooks/useProductionSchedule";

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onJumpToToday: () => void;
  visibleRange: { start: Date; end: Date };
  // Filters
  lines: FactoryLine[];
  buyers: string[];
  selectedLine: string;
  onLineChange: (value: string) => void;
  selectedBuyer: string;
  onBuyerChange: (value: string) => void;
  riskOnly: boolean;
  onRiskOnlyChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function ScheduleControls({
  viewMode, onViewModeChange, onNavigateBack, onNavigateForward, onJumpToToday,
  visibleRange, lines, buyers, selectedLine, onLineChange, selectedBuyer, onBuyerChange,
  riskOnly, onRiskOnlyChange, search, onSearchChange,
}: Props) {
  const rangeLabel = viewMode === "week"
    ? `${format(visibleRange.start, "d MMM")} – ${format(visibleRange.end, "d MMM yyyy")}`
    : format(visibleRange.start, "MMMM yyyy");

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      {/* Left: navigation + range */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs rounded-md"
            onClick={() => onViewModeChange("week")}
          >
            Week
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs rounded-md"
            onClick={() => onViewModeChange("month")}
          >
            Month
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onNavigateBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700 min-w-[160px] text-center">{rangeLabel}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onNavigateForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={onJumpToToday}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Today
        </Button>
      </div>

      {/* Right: filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search PO..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 w-[140px] pl-8 text-xs"
          />
        </div>

        <Select value={selectedLine} onValueChange={onLineChange}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue placeholder="All Lines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lines</SelectItem>
            {lines.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.line_id}{l.name ? ` – ${l.name}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedBuyer} onValueChange={onBuyerChange}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue placeholder="All Buyers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buyers</SelectItem>
            {buyers.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={riskOnly ? "default" : "outline"}
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onRiskOnlyChange(!riskOnly)}
        >
          Risks Only
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ScheduleControls.tsx
git commit -m "feat(schedule): add ScheduleControls with view toggle, navigation, and filters"
```

---

## Task 5: Timeline Components (Header, Bar, Row, Planner)

**Files:**
- Create: `src/components/schedule/TimelineHeader.tsx`
- Create: `src/components/schedule/ScheduleBar.tsx`
- Create: `src/components/schedule/TimelineRow.tsx`
- Create: `src/components/schedule/TimelinePlanner.tsx`

- [ ] **Step 1: Create TimelineHeader**

```tsx
import { eachDayOfInterval, format, isToday, isWeekend } from "date-fns";
import type { ViewMode } from "@/hooks/useTimelineState";

interface Props {
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
}

export function TimelineHeader({ visibleRange, viewMode, dayWidth }: Props) {
  const days = eachDayOfInterval(visibleRange);

  return (
    <div className="flex border-b border-slate-200">
      {/* Line label spacer */}
      <div className="w-[168px] shrink-0 border-r border-slate-200 bg-slate-50/50 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Line</span>
      </div>

      {/* Date columns */}
      <div className="flex">
        {days.map((day) => {
          const weekend = isWeekend(day);
          const todayCol = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={`flex flex-col items-center justify-center border-r border-slate-100/60 py-2 ${
                weekend ? "bg-slate-50/80" : ""
              } ${todayCol ? "bg-blue-50/60" : ""}`}
              style={{ width: dayWidth, minWidth: dayWidth }}
            >
              <span className={`text-[10px] font-medium ${todayCol ? "text-blue-600" : "text-slate-400"}`}>
                {format(day, "EEE")}
              </span>
              <span className={`text-xs font-semibold ${todayCol ? "text-blue-700" : "text-slate-600"}`}>
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ScheduleBar**

```tsx
import { parseISO, differenceInDays, isAfter } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import type { ScheduleWithDetails } from "@/hooks/useProductionSchedule";

interface Props {
  schedule: ScheduleWithDetails;
  visibleStart: Date;
  dayWidth: number;
  onClick: () => void;
}

function getBarColor(schedule: ScheduleWithDetails): string {
  if (schedule.status === "completed") return "bg-slate-200 text-slate-500 opacity-60";
  if (schedule.colour) return `text-white`;
  const exFactory = schedule.workOrder.planned_ex_factory;
  if (exFactory) {
    const endDate = parseISO(schedule.end_date);
    const exDate = parseISO(exFactory);
    if (isAfter(endDate, exDate)) return "bg-red-500/90 text-white";
    const daysToEx = differenceInDays(exDate, endDate);
    if (daysToEx <= 7) return "bg-amber-500/90 text-white";
  }
  return "bg-blue-500/90 text-white";
}

export function ScheduleBar({ schedule, visibleStart, dayWidth, onClick }: Props) {
  const start = parseISO(schedule.start_date);
  const end = parseISO(schedule.end_date);

  // Calculate position relative to visible start
  const offsetDays = Math.max(0, differenceInDays(start, visibleStart));
  const clippedStart = start < visibleStart ? visibleStart : start;
  const durationDays = differenceInDays(end, clippedStart) + 1;

  const left = offsetDays * dayWidth;
  const width = Math.max(durationDays * dayWidth - 4, dayWidth - 4); // -4 for gap

  const barColor = getBarColor(schedule);
  const isDelayed = schedule.status === "delayed";

  // Ex-factory marker
  const exFactory = schedule.workOrder.planned_ex_factory;
  let exMarkerLeft: number | null = null;
  if (exFactory) {
    const exDate = parseISO(exFactory);
    const exOffset = differenceInDays(exDate, visibleStart);
    if (exOffset >= 0) {
      exMarkerLeft = exOffset * dayWidth + dayWidth / 2;
    }
  }

  const daysRemaining = exFactory ? differenceInDays(parseISO(exFactory), new Date()) : null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`absolute top-[10px] h-[44px] rounded-md shadow-sm cursor-pointer transition-all duration-150 hover:brightness-110 hover:shadow-md flex items-center px-3 gap-1.5 overflow-hidden ${barColor} ${isDelayed ? "border-l-4 border-red-600" : ""}`}
            style={{
              left: `${left + 2}px`,
              width: `${width}px`,
              ...(schedule.colour && schedule.status !== "completed" ? { backgroundColor: schedule.colour } : {}),
            }}
            onClick={onClick}
          >
            <span className="text-xs font-semibold truncate">{schedule.workOrder.po_number}</span>
            <span className="text-[10px] opacity-80 truncate hidden sm:inline">{schedule.workOrder.buyer}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <div className="space-y-1">
            <p className="font-semibold text-sm">{schedule.workOrder.po_number}</p>
            <p className="text-xs text-muted-foreground">{schedule.workOrder.buyer} – {schedule.workOrder.style}</p>
            <p className="text-xs">{format(start, "d MMM")} → {format(end, "d MMM yyyy")}</p>
            {daysRemaining !== null && (
              <p className={`text-xs font-medium ${daysRemaining <= 0 ? "text-red-600" : daysRemaining <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                {daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d to ex-factory`}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Ex-factory marker */}
      {exMarkerLeft !== null && (
        <div
          className="absolute top-[6px] w-[2px] h-[10px] bg-red-400/60 rounded-full pointer-events-none"
          style={{ left: `${exMarkerLeft}px` }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Create TimelineRow**

```tsx
import { eachDayOfInterval, isToday, isWeekend } from "date-fns";
import { ScheduleBar } from "./ScheduleBar";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails } from "@/hooks/useProductionSchedule";

interface Props {
  line: FactoryLine;
  schedules: ScheduleWithDetails[];
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
  onBarClick: (schedule: ScheduleWithDetails) => void;
  isEven: boolean;
}

export function TimelineRow({ line, schedules, visibleRange, viewMode, dayWidth, onBarClick, isEven }: Props) {
  const days = eachDayOfInterval(visibleRange);
  const isEmpty = schedules.length === 0;
  const hasOverlap = checkOverlaps(schedules);

  return (
    <div className={`flex border-b border-slate-100 ${isEven ? "bg-white" : "bg-slate-50/30"}`} style={{ height: 68 }}>
      {/* Line label */}
      <div className="w-[168px] shrink-0 border-r border-slate-200 bg-slate-50/50 px-4 flex flex-col justify-center">
        <span className="text-sm font-semibold text-slate-800">{line.line_id}</span>
        {line.name && <span className="text-[10px] text-slate-400 truncate">{line.name}</span>}
      </div>

      {/* Grid + bars */}
      <div className="relative flex-1">
        {/* Grid columns */}
        <div className="flex h-full">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`border-r border-slate-100/60 h-full ${
                isWeekend(day) ? "bg-slate-50/80" : ""
              } ${isToday(day) ? "bg-blue-50/40" : ""}`}
              style={{ width: dayWidth, minWidth: dayWidth }}
            />
          ))}
        </div>

        {/* Empty row indicator */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center pointer-events-none">
            <div className="w-full mx-6 border-t border-dashed border-slate-200/60" />
          </div>
        )}

        {/* Today vertical marker */}
        {days.map((day) =>
          isToday(day) ? (
            <div
              key="today"
              className="absolute top-0 bottom-0 w-[2px] bg-blue-500/70 pointer-events-none z-10"
              style={{ left: days.indexOf(day) * dayWidth + dayWidth / 2 }}
            />
          ) : null
        )}

        {/* Schedule bars */}
        {schedules.map((s) => (
          <ScheduleBar
            key={s.id}
            schedule={s}
            visibleStart={visibleRange.start}
            dayWidth={dayWidth}
            onClick={() => onBarClick(s)}
          />
        ))}
      </div>
    </div>
  );
}

function checkOverlaps(schedules: ScheduleWithDetails[]): boolean {
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      if (schedules[i].start_date <= schedules[j].end_date && schedules[j].start_date <= schedules[i].end_date) {
        return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 4: Create TimelinePlanner**

```tsx
import { useMemo } from "react";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineRow } from "./TimelineRow";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails } from "@/hooks/useProductionSchedule";

interface Props {
  lines: FactoryLine[];
  schedulesByLine: Map<string, ScheduleWithDetails[]>;
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  onBarClick: (schedule: ScheduleWithDetails) => void;
}

export function TimelinePlanner({ lines, schedulesByLine, visibleRange, viewMode, onBarClick }: Props) {
  const dayWidth = viewMode === "week" ? 120 : 40;

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: viewMode === "week" ? "auto" : 1200 }}>
          <TimelineHeader visibleRange={visibleRange} viewMode={viewMode} dayWidth={dayWidth} />
          {lines.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">
              No active lines found
            </div>
          ) : (
            lines.map((line, i) => (
              <TimelineRow
                key={line.id}
                line={line}
                schedules={schedulesByLine.get(line.id) ?? []}
                visibleRange={visibleRange}
                viewMode={viewMode}
                dayWidth={dayWidth}
                onBarClick={onBarClick}
                isEven={i % 2 === 0}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TimelineHeader.tsx src/components/schedule/ScheduleBar.tsx src/components/schedule/TimelineRow.tsx src/components/schedule/TimelinePlanner.tsx
git commit -m "feat(schedule): add timeline planner components (header, bar, row, planner)"
```

---

## Task 6: Unscheduled Sidebar Components

**Files:**
- Create: `src/components/schedule/UnscheduledPOCard.tsx`
- Create: `src/components/schedule/UnscheduledSidebar.tsx`

- [ ] **Step 1: Create UnscheduledPOCard**

```tsx
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import type { UnscheduledPO } from "@/hooks/useProductionSchedule";

interface Props {
  po: UnscheduledPO;
  onSchedule: (po: UnscheduledPO) => void;
}

export function UnscheduledPOCard({ po, onSchedule }: Props) {
  const exColor = po.urgency === "at_risk" ? "text-red-600" : po.urgency === "upcoming" ? "text-amber-600" : "text-slate-500";

  return (
    <div className="flex items-start justify-between gap-2 p-3 rounded-lg border border-slate-150 bg-white hover:shadow-sm transition-shadow">
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{po.po_number}</p>
        <p className="text-[11px] text-slate-500 truncate">{po.buyer} – {po.style}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-400">{po.order_qty?.toLocaleString()} pcs</span>
          {po.planned_ex_factory && (
            <span className={`text-[10px] font-medium ${exColor}`}>
              Ex: {format(parseISO(po.planned_ex_factory), "d MMM")}
              {po.daysToExFactory !== null && (
                <span className="ml-1">
                  ({po.daysToExFactory <= 0 ? "overdue" : `${po.daysToExFactory}d`})
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs shrink-0" onClick={() => onSchedule(po)}>
        Schedule
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create UnscheduledSidebar**

```tsx
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { UnscheduledPOCard } from "./UnscheduledPOCard";
import type { UnscheduledPO, UrgencyGroup } from "@/hooks/useProductionSchedule";

interface Props {
  unscheduledPOs: UnscheduledPO[];
  onSchedule: (po: UnscheduledPO) => void;
}

const groupConfig: Record<UrgencyGroup, { label: string; color: string }> = {
  at_risk: { label: "At Risk", color: "text-red-600" },
  upcoming: { label: "Upcoming", color: "text-amber-600" },
  later: { label: "Later", color: "text-slate-500" },
};

export function UnscheduledSidebar({ unscheduledPOs, onSchedule }: Props) {
  const groups = (["at_risk", "upcoming", "later"] as const).map((key) => ({
    key,
    ...groupConfig[key],
    items: unscheduledPOs.filter((po) => po.urgency === key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="w-full lg:w-[320px] shrink-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto">
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-sm font-semibold text-slate-800">Unscheduled Orders</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 h-5">{unscheduledPOs.length}</Badge>
        </div>

        {/* Content */}
        <div className="p-3 space-y-4">
          {unscheduledPOs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-sm font-medium text-slate-600">All orders scheduled</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Every active PO has been assigned to a line</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${group.color}`}>
                  {group.label} ({group.items.length})
                </p>
                <div className="space-y-2">
                  {group.items.map((po) => (
                    <UnscheduledPOCard key={po.id} po={po} onSchedule={onSchedule} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/UnscheduledPOCard.tsx src/components/schedule/UnscheduledSidebar.tsx
git commit -m "feat(schedule): add unscheduled sidebar with urgency grouping and PO cards"
```

---

## Task 7: Schedule Modal (Create / Edit)

**Files:**
- Create: `src/components/schedule/ScheduleModal.tsx`

- [ ] **Step 1: Create the schedule modal**

```tsx
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import type { FactoryLine, WorkOrder, ScheduleWithDetails, ScheduleFormData } from "@/hooks/useProductionSchedule";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: WorkOrder | null;
  editSchedule: ScheduleWithDetails | null;
  lines: FactoryLine[];
  existingSchedules: ScheduleWithDetails[];
  onSubmit: (data: ScheduleFormData) => void;
  isPending: boolean;
}

export function ScheduleModal({ open, onOpenChange, workOrder, editSchedule, lines, existingSchedules, onSubmit, isPending }: Props) {
  const isEdit = !!editSchedule;
  const wo = editSchedule?.workOrder ?? workOrder;

  const [lineId, setLineId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetQty, setTargetQty] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [notes, setNotes] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return;
    if (editSchedule) {
      setLineId(editSchedule.line_id);
      setStartDate(editSchedule.start_date);
      setEndDate(editSchedule.end_date);
      setTargetQty(editSchedule.target_qty?.toString() ?? "");
      setDailyTarget(editSchedule.daily_target?.toString() ?? "");
      setNotes(editSchedule.notes ?? "");
    } else {
      setLineId("");
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      setEndDate("");
      setTargetQty(wo?.order_qty?.toString() ?? "");
      setDailyTarget("");
      setNotes("");
    }
  }, [open, editSchedule, wo]);

  // Auto-derive end date
  useEffect(() => {
    if (!startDate || isEdit) return;
    const qty = parseInt(targetQty) || 0;
    const daily = parseInt(dailyTarget) || 0;
    if (qty > 0 && daily > 0) {
      const days = Math.ceil(qty / daily) - 1;
      setEndDate(format(addDays(parseISO(startDate), days), "yyyy-MM-dd"));
    }
  }, [startDate, targetQty, dailyTarget, isEdit]);

  // Auto-fill daily target from selected line
  useEffect(() => {
    if (isEdit || !lineId) return;
    const line = lines.find((l) => l.id === lineId);
    if (line?.target_per_day && !dailyTarget) {
      setDailyTarget(line.target_per_day.toString());
    }
  }, [lineId, lines, isEdit, dailyTarget]);

  // Overlap warning
  const overlapWarning = useMemo(() => {
    if (!lineId || !startDate || !endDate) return null;
    const overlapping = existingSchedules.filter(
      (s) =>
        s.line_id === lineId &&
        s.id !== editSchedule?.id &&
        s.start_date <= endDate &&
        s.end_date >= startDate
    );
    if (overlapping.length === 0) return null;
    const first = overlapping[0];
    return `${first.line.line_id} has ${first.workOrder.po_number} scheduled ${first.start_date} – ${first.end_date}`;
  }, [lineId, startDate, endDate, existingSchedules, editSchedule]);

  // Ex-factory warning
  const exFactoryWarning = useMemo(() => {
    if (!endDate || !wo?.planned_ex_factory) return null;
    if (endDate > wo.planned_ex_factory) {
      return `End date is after the ex-factory deadline (${format(parseISO(wo.planned_ex_factory), "d MMM yyyy")})`;
    }
    return null;
  }, [endDate, wo]);

  const canSubmit = lineId && startDate && endDate && endDate >= startDate;

  function handleSubmit() {
    if (!canSubmit || !wo) return;
    onSubmit({
      ...(editSchedule ? { id: editSchedule.id } : {}),
      work_order_id: wo.id,
      line_id: lineId,
      start_date: startDate,
      end_date: endDate,
      target_qty: targetQty ? parseInt(targetQty) : null,
      daily_target: dailyTarget ? parseInt(dailyTarget) : null,
      notes: notes || null,
    } as any);
  }

  if (!wo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Schedule" : "Schedule PO"}</DialogTitle>
        </DialogHeader>

        {/* PO Info strip */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-0.5">
          <p className="text-sm font-semibold text-slate-800">{wo.po_number}</p>
          <p className="text-xs text-slate-500">{wo.buyer} – {wo.style} {wo.color ? `(${wo.color})` : ""}</p>
          <p className="text-xs text-slate-400">{wo.order_qty?.toLocaleString()} pcs
            {wo.planned_ex_factory && ` · Ex-factory: ${format(parseISO(wo.planned_ex_factory), "d MMM yyyy")}`}
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Line</Label>
            <Select value={lineId} onValueChange={setLineId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a line" />
              </SelectTrigger>
              <SelectContent>
                {lines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.line_id}{l.name ? ` – ${l.name}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Target Quantity</Label>
              <Input type="number" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} placeholder="e.g. 5000" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Daily Target</Label>
              <Input type="number" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} placeholder="e.g. 300" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional scheduling notes..." rows={2} className="text-sm resize-none" />
          </div>

          {/* Warnings */}
          {overlapWarning && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{overlapWarning}</span>
            </div>
          )}
          {exFactoryWarning && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{exFactoryWarning}</span>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? "Saving..." : isEdit ? "Update Schedule" : "Schedule PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ScheduleModal.tsx
git commit -m "feat(schedule): add ScheduleModal for creating and editing schedule entries"
```

---

## Task 8: Schedule Detail Drawer

**Files:**
- Create: `src/components/schedule/ScheduleDetailDrawer.tsx`

- [ ] **Step 1: Create the detail drawer**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format, parseISO, differenceInDays } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import type { ScheduleWithDetails } from "@/hooks/useProductionSchedule";

interface Props {
  schedule: ScheduleWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (schedule: ScheduleWithDetails) => void;
  onDelete: (id: string) => void;
}

const statusColors: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  delayed: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  delayed: "Delayed",
};

export function ScheduleDetailDrawer({ schedule, open, onOpenChange, onEdit, onDelete }: Props) {
  if (!schedule) return null;

  const wo = schedule.workOrder;
  const start = parseISO(schedule.start_date);
  const end = parseISO(schedule.end_date);
  const duration = differenceInDays(end, start) + 1;
  const isAtRisk = wo.planned_ex_factory && parseISO(schedule.end_date) > parseISO(wo.planned_ex_factory);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[400px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">{wo.po_number}</SheetTitle>
            <Badge className={statusColors[schedule.status]}>{statusLabels[schedule.status]}</Badge>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Detail rows */}
          <DetailSection label="Buyer" value={wo.buyer} />
          <DetailSection label="Style" value={wo.style} />
          {wo.color && <DetailSection label="Color" value={wo.color} />}
          {wo.item && <DetailSection label="Item" value={wo.item} />}
          <DetailSection label="Line" value={`${schedule.line.line_id}${schedule.line.name ? ` – ${schedule.line.name}` : ""}`} />
          <DetailSection label="Start Date" value={format(start, "d MMMM yyyy")} />
          <DetailSection label="End Date" value={format(end, "d MMMM yyyy")} />
          <DetailSection label="Duration" value={`${duration} day${duration !== 1 ? "s" : ""}`} />

          {wo.planned_ex_factory && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">Ex-Factory</span>
              <span className={`text-sm font-medium ${isAtRisk ? "text-red-600" : "text-slate-800"}`}>
                {format(parseISO(wo.planned_ex_factory), "d MMMM yyyy")}
                {isAtRisk && <span className="ml-1 text-[10px] text-red-500">(at risk)</span>}
              </span>
            </div>
          )}

          {schedule.target_qty && <DetailSection label="Target Qty" value={schedule.target_qty.toLocaleString()} />}
          {schedule.daily_target && <DetailSection label="Daily Target" value={schedule.daily_target.toLocaleString()} />}
          <DetailSection label="Order Qty" value={wo.order_qty?.toLocaleString() ?? "—"} />
          {schedule.notes && <DetailSection label="Notes" value={schedule.notes} />}
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { onOpenChange(false); onEdit(schedule); }}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Schedule
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 text-red-500 hover:text-red-600 hover:border-red-200">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove from schedule?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will unschedule {wo.po_number} from {schedule.line.line_id}. The PO will appear in the unscheduled queue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={() => { onDelete(schedule.id); onOpenChange(false); }}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-slate-100">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ScheduleDetailDrawer.tsx
git commit -m "feat(schedule): add ScheduleDetailDrawer for inspecting schedule entries"
```

---

## Task 9: Schedule Page + Route + Navigation

**Files:**
- Create: `src/pages/Schedule.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Create the Schedule page**

```tsx
import { useState, useCallback } from "react";
import { CalendarRange } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProductionSchedule, type ScheduleWithDetails, type UnscheduledPO, type WorkOrder } from "@/hooks/useProductionSchedule";
import { useTimelineState } from "@/hooks/useTimelineState";
import { ScheduleKPIStrip } from "@/components/schedule/ScheduleKPIStrip";
import { ScheduleControls } from "@/components/schedule/ScheduleControls";
import { TimelinePlanner } from "@/components/schedule/TimelinePlanner";
import { UnscheduledSidebar } from "@/components/schedule/UnscheduledSidebar";
import { ScheduleModal } from "@/components/schedule/ScheduleModal";
import { ScheduleDetailDrawer } from "@/components/schedule/ScheduleDetailDrawer";

export default function Schedule() {
  const { profile } = useAuth();
  const timeline = useTimelineState();

  // Filters
  const [selectedLine, setSelectedLine] = useState("all");
  const [selectedBuyer, setSelectedBuyer] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [search, setSearch] = useState("");

  const {
    lines, schedulesByLine, visibleSchedules, unscheduledPOs, schedulesWithDetails,
    buyers, kpis, isLoading, createSchedule, updateSchedule, deleteSchedule,
  } = useProductionSchedule({
    visibleRange: timeline.visibleRange,
    filters: {
      lineId: selectedLine !== "all" ? selectedLine : undefined,
      buyer: selectedBuyer !== "all" ? selectedBuyer : undefined,
      riskOnly,
      search: search || undefined,
    },
  });

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalWorkOrder, setModalWorkOrder] = useState<WorkOrder | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithDetails | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithDetails | null>(null);

  const handleScheduleUnscheduled = useCallback((po: UnscheduledPO) => {
    setModalWorkOrder(po as WorkOrder);
    setEditingSchedule(null);
    setModalOpen(true);
  }, []);

  const handleBarClick = useCallback((schedule: ScheduleWithDetails) => {
    setSelectedSchedule(schedule);
    setDrawerOpen(true);
  }, []);

  const handleEdit = useCallback((schedule: ScheduleWithDetails) => {
    setEditingSchedule(schedule);
    setModalWorkOrder(null);
    setModalOpen(true);
  }, []);

  const handleModalSubmit = useCallback((data: any) => {
    if (data.id) {
      updateSchedule.mutate(data, { onSuccess: () => setModalOpen(false) });
    } else {
      createSchedule.mutate(data, { onSuccess: () => setModalOpen(false) });
    }
  }, [createSchedule, updateSchedule]);

  const handleDelete = useCallback((id: string) => {
    deleteSchedule.mutate(id);
  }, [deleteSchedule]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="py-3 md:py-4 lg:py-6 space-y-4 md:space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <CalendarRange className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Production Schedule</h1>
          <p className="text-sm text-slate-500">Plan and track production line allocation across orders</p>
        </div>
      </div>

      {/* KPI Strip */}
      <ScheduleKPIStrip kpis={kpis} />

      {/* Controls */}
      <ScheduleControls
        viewMode={timeline.viewMode}
        onViewModeChange={timeline.setViewMode}
        onNavigateBack={timeline.navigateBack}
        onNavigateForward={timeline.navigateForward}
        onJumpToToday={timeline.jumpToToday}
        visibleRange={timeline.visibleRange}
        lines={lines}
        buyers={buyers}
        selectedLine={selectedLine}
        onLineChange={setSelectedLine}
        selectedBuyer={selectedBuyer}
        onBuyerChange={setSelectedBuyer}
        riskOnly={riskOnly}
        onRiskOnlyChange={setRiskOnly}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Main layout: Timeline + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <TimelinePlanner
            lines={lines}
            schedulesByLine={schedulesByLine}
            visibleRange={timeline.visibleRange}
            viewMode={timeline.viewMode}
            onBarClick={handleBarClick}
          />
        </div>
        <UnscheduledSidebar unscheduledPOs={unscheduledPOs} onSchedule={handleScheduleUnscheduled} />
      </div>

      {/* Modal */}
      <ScheduleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        workOrder={modalWorkOrder}
        editSchedule={editingSchedule}
        lines={lines}
        existingSchedules={schedulesWithDetails}
        onSubmit={handleModalSubmit}
        isPending={createSchedule.isPending || updateSchedule.isPending}
      />

      {/* Drawer */}
      <ScheduleDetailDrawer
        schedule={selectedSchedule}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add lazy import and route to App.tsx**

After line 75 (the GatePassView import), add:
```typescript
const Schedule = lazy(() => import("./pages/Schedule"));
```

After line 188 (the `/finances` route), add:
```tsx
<Route path="/schedule" element={<SubscriptionGate><ProtectedRoute adminOnly><Schedule /></ProtectedRoute></SubscriptionGate>} />
```

- [ ] **Step 3: Add nav item to constants.ts**

In the `admin` array, after the `{ path: '/work-orders', ...}` entry (line 228), add:
```typescript
{ path: '/schedule', label: 'Schedule', icon: 'CalendarRange', group: 'Records' },
```

Add the same entry in the `owner` array, after its `{ path: '/work-orders', ...}` entry (line 248):
```typescript
{ path: '/schedule', label: 'Schedule', icon: 'CalendarRange', group: 'Records' },
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Schedule.tsx src/App.tsx src/lib/constants.ts
git commit -m "feat(schedule): add Schedule page with route and navigation for admin/owner"
```

---

## Task 10: Build Verification

- [ ] **Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: No errors, or only pre-existing warnings

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build completes successfully

- [ ] **Step 3: Fix any issues found**

Address any type errors or build failures. The most likely issue is the `production_schedule` table not existing in the generated Supabase types — the `as any` casts in the hook handle this. If other type issues appear, fix them.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix(schedule): resolve build issues"
```
