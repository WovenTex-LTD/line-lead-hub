import { useState, useCallback, useRef, useEffect } from "react";
import { CalendarRange } from "lucide-react";
import { Loader2 } from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import { useProductionSchedule, type ScheduleWithDetails, type ScheduleFormData, type UnscheduledPO, type WorkOrder } from "@/hooks/useProductionSchedule";
import { useTimelineState } from "@/hooks/useTimelineState";
import { ScheduleKPIStrip } from "@/components/schedule/ScheduleKPIStrip";
import { ScheduleControls } from "@/components/schedule/ScheduleControls";
import { TimelinePlanner } from "@/components/schedule/TimelinePlanner";
import { UnscheduledSidebar } from "@/components/schedule/UnscheduledSidebar";
import { ScheduleModal } from "@/components/schedule/ScheduleModal";
import { ScheduleDetailDrawer } from "@/components/schedule/ScheduleDetailDrawer";
import { MiniCalendar } from "@/components/schedule/MiniCalendar";
import { useSidebar } from "@/components/ui/sidebar";

export type RowSize = "compact" | "default" | "expanded";

export default function Schedule() {
  // Collapse the app sidebar on mount, restore on unmount
  const { setOpen } = useSidebar();
  useEffect(() => {
    setOpen(false);
    return () => { setOpen(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const timeline = useTimelineState();

  const [selectedLine, setSelectedLine] = useState("all");
  const [selectedBuyer, setSelectedBuyer] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [rowSize, setRowSize] = useState<RowSize>("default");
  const [visibleMonthLabel, setVisibleMonthLabel] = useState("");

  const {
    lines, schedulesByLine, visibleSchedules, unscheduledPOs, schedulesWithDetails,
    deadlines, buyers, kpis, isLoading, createSchedule, updateSchedule, deleteSchedule,
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

  // Drag state
  const [activeDrag, setActiveDrag] = useState<{ type: "schedule-bar" | "unscheduled-po"; data: any } | null>(null);

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

  const handleModalSubmit = useCallback((data: ScheduleFormData) => {
    if (data.id) {
      updateSchedule.mutate(data as ScheduleFormData & { id: string }, { onSuccess: () => setModalOpen(false) });
    } else {
      createSchedule.mutate(data, { onSuccess: () => setModalOpen(false) });
    }
  }, [createSchedule, updateSchedule]);

  const handleDelete = useCallback((id: string) => {
    deleteSchedule.mutate(id);
  }, [deleteSchedule]);

  // ── Drag & Drop ──────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // 8px minimum drag before activating
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.type === "schedule-bar") {
      setActiveDrag({ type: "schedule-bar", data: data.schedule });
    } else if (data?.type === "unscheduled-po") {
      setActiveDrag({ type: "unscheduled-po", data: data.workOrder });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over, delta } = event;
    if (!over) return;

    const overData = over.data.current;
    if (overData?.type !== "line-row") return;

    const activeData = active.data.current;
    const targetLineId: string = overData.lineId;
    const dayWidth: number = overData.dayWidth;
    const visibleStart: Date = overData.visibleStart;

    if (activeData?.type === "schedule-bar") {
      // Reschedule: calculate new start date from horizontal delta
      const schedule: ScheduleWithDetails = activeData.schedule;
      const daysDelta = Math.round(delta.x / dayWidth);
      if (daysDelta === 0 && targetLineId === schedule.line_id) return; // no change

      const oldStart = parseISO(schedule.start_date);
      const oldEnd = parseISO(schedule.end_date);
      const duration = differenceInDays(oldEnd, oldStart);
      const newStart = addDays(oldStart, daysDelta);
      const newEnd = addDays(newStart, duration);

      updateSchedule.mutate({
        id: schedule.id,
        work_order_id: schedule.work_order_id,
        line_id: targetLineId,
        start_date: format(newStart, "yyyy-MM-dd"),
        end_date: format(newEnd, "yyyy-MM-dd"),
      });
    } else if (activeData?.type === "unscheduled-po") {
      // New schedule: calculate start date from drop position
      const workOrder: WorkOrder = activeData.workOrder;

      // Estimate drop column from the pointer position relative to the droppable
      // Use the over rect to find the left edge of the grid area
      const overRect = over.rect;
      const dropX = (event as any).activatorEvent?.clientX + delta.x - overRect.left;
      const dayOffset = Math.max(0, Math.floor((dropX ?? 0) / dayWidth));
      const newStart = addDays(visibleStart, dayOffset);

      // Default 7-day duration for new schedules from drag
      const defaultDuration = 7;
      const newEnd = addDays(newStart, defaultDuration - 1);

      createSchedule.mutate({
        work_order_id: workOrder.id,
        line_id: targetLineId,
        start_date: format(newStart, "yyyy-MM-dd"),
        end_date: format(newEnd, "yyyy-MM-dd"),
      });
    }
  }, [updateSchedule, createSchedule]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
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
          anchorDate={timeline.anchorDate}
          visibleMonthLabel={visibleMonthLabel}
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
          rowSize={rowSize}
          onRowSizeChange={setRowSize}
        />

        {/* Main layout */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Mini calendar + Unscheduled orders */}
          <div className="hidden lg:flex lg:flex-col lg:gap-2 w-[196px] shrink-0">
            <div className="sticky top-0 space-y-2">
              <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <MiniCalendar
                  anchorDate={timeline.anchorDate}
                  visibleRange={timeline.visibleRange}
                  onDateClick={timeline.goToDate}
                />
              </div>
              <UnscheduledSidebar unscheduledPOs={unscheduledPOs} onSchedule={handleScheduleUnscheduled} />
            </div>
          </div>

          {/* Mobile: Unscheduled orders */}
          <div className="lg:hidden">
            <UnscheduledSidebar unscheduledPOs={unscheduledPOs} onSchedule={handleScheduleUnscheduled} />
          </div>

          {/* Main: Timeline planner */}
          <div className="flex-1 min-w-0">
            <TimelinePlanner
              lines={lines}
              schedulesByLine={schedulesByLine}
              deadlines={deadlines}
              visibleRange={timeline.visibleRange}
              viewMode={timeline.viewMode}
              rowSize={rowSize}
              todayOffset={timeline.todayOffset}
              onBarClick={handleBarClick}
              onVisibleMonthChange={setVisibleMonthLabel}
            />
          </div>
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

      {/* Drag overlay — the ghost that follows the cursor */}
      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === "schedule-bar" && (
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md shadow-xl px-3 py-2 opacity-90 pointer-events-none min-w-[120px]">
            <span className="text-[11px] font-semibold">{activeDrag.data.workOrder.po_number}</span>
            <span className="text-[9px] opacity-75 ml-1.5">{activeDrag.data.workOrder.buyer}</span>
          </div>
        )}
        {activeDrag?.type === "unscheduled-po" && (
          <div className="bg-white border border-blue-300 rounded-md shadow-xl px-3 py-2 opacity-90 pointer-events-none min-w-[120px]">
            <span className="text-[11px] font-bold text-slate-800">{activeDrag.data.po_number}</span>
            <span className="text-[10px] text-slate-400 ml-1.5">{activeDrag.data.buyer}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
