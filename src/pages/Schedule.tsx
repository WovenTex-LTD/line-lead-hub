import { useState, useCallback } from "react";
import { CalendarRange } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useProductionSchedule, type ScheduleWithDetails, type ScheduleFormData, type UnscheduledPO, type WorkOrder } from "@/hooks/useProductionSchedule";
import { useTimelineState } from "@/hooks/useTimelineState";
import { ScheduleKPIStrip } from "@/components/schedule/ScheduleKPIStrip";
import { ScheduleControls } from "@/components/schedule/ScheduleControls";
import { TimelinePlanner } from "@/components/schedule/TimelinePlanner";
import { UnscheduledSidebar } from "@/components/schedule/UnscheduledSidebar";
import { ScheduleModal } from "@/components/schedule/ScheduleModal";
import { ScheduleDetailDrawer } from "@/components/schedule/ScheduleDetailDrawer";

export default function Schedule() {
  const timeline = useTimelineState();

  // Filters
  const [selectedLine, setSelectedLine] = useState("all");
  const [selectedBuyer, setSelectedBuyer] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [search, setSearch] = useState("");

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
            deadlines={deadlines}
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
