import { useState, useCallback } from "react";
import { Loader2, CalendarRange, Package } from "lucide-react";
import { useProductionSchedule, type ScheduleWithDetails, type ScheduleFormData, type UnscheduledPO, type WorkOrder } from "@/hooks/useProductionSchedule";
import { useTimelineState } from "@/hooks/useTimelineState";
import { ScheduleControls } from "@/components/schedule/ScheduleControls";
import { TimelinePlanner } from "@/components/schedule/TimelinePlanner";
import { UnscheduledSidebar } from "@/components/schedule/UnscheduledSidebar";
import { ScheduleModal } from "@/components/schedule/ScheduleModal";
import { ScheduleDetailDrawer } from "@/components/schedule/ScheduleDetailDrawer";

export type RowSize = "compact" | "default" | "expanded";

export default function Schedule() {
  const timeline = useTimelineState();

  const [selectedLine, setSelectedLine] = useState("all");
  const [selectedBuyer, setSelectedBuyer] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [rowSize, setRowSize] = useState<RowSize>("default");

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

  const [modalOpen, setModalOpen] = useState(false);
  const [modalWorkOrder, setModalWorkOrder] = useState<WorkOrder | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithDetails | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithDetails | null>(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);

  const handleScheduleUnscheduled = useCallback((po: UnscheduledPO) => {
    setModalWorkOrder(po as WorkOrder);
    setEditingSchedule(null);
    setModalOpen(true);
    setUnscheduledOpen(false);
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
        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="py-4 lg:py-6 space-y-5">
      {/* ── Header: title + inline metrics ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <CalendarRange className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">Production Schedule</h1>
            <p className="text-[12px] text-slate-400 mt-0.5">Line allocation & deadline tracking</p>
          </div>
        </div>

        {/* Inline metrics — not cards, just numbers */}
        <div className="hidden md:flex items-center gap-6">
          <Metric label="Scheduled" value={kpis.scheduledCount} />
          <div className="w-px h-8 bg-slate-100" />
          <Metric label="Unscheduled" value={kpis.unscheduledCount} warn={kpis.unscheduledCount > 0} />
          <div className="w-px h-8 bg-slate-100" />
          <Metric label="Lines active" value={kpis.linesInUse} />
          <div className="w-px h-8 bg-slate-100" />
          <Metric label="At risk" value={kpis.exFactoryRisks} danger={kpis.exFactoryRisks > 0} />
        </div>
      </div>

      {/* ── Command bar ── */}
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
        rowSize={rowSize}
        onRowSizeChange={setRowSize}
      />

      {/* ── Planner — the hero ── */}
      <TimelinePlanner
        lines={lines}
        schedulesByLine={schedulesByLine}
        deadlines={deadlines}
        visibleRange={timeline.visibleRange}
        viewMode={timeline.viewMode}
        rowSize={rowSize}
        onBarClick={handleBarClick}
      />

      {/* ── Floating unscheduled trigger ── */}
      {unscheduledPOs.length > 0 && (
        <button
          onClick={() => setUnscheduledOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 pl-4 pr-5 h-11 rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:shadow-xl transition-all duration-200"
        >
          <Package className="h-4 w-4" />
          <span className="text-[13px] font-semibold">{kpis.unscheduledCount} unscheduled</span>
          {kpis.exFactoryRisks > 0 && (
            <span className="ml-0.5 h-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold flex items-center">{kpis.exFactoryRisks}</span>
          )}
        </button>
      )}

      {/* ── Unscheduled orders drawer ── */}
      <UnscheduledSidebar
        unscheduledPOs={unscheduledPOs}
        onSchedule={handleScheduleUnscheduled}
        open={unscheduledOpen}
        onOpenChange={setUnscheduledOpen}
      />

      {/* ── Schedule modal ── */}
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

      {/* ── Detail drawer ── */}
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

/** Inline metric — just a label + number, no card wrapper */
function Metric({ label, value, warn, danger }: { label: string; value: number; warn?: boolean; danger?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-[22px] font-extrabold tabular-nums leading-none mt-0.5 tracking-tight
        ${danger ? "text-red-600" : warn ? "text-amber-600" : "text-slate-900"}
      `}>
        {value}
      </p>
    </div>
  );
}
