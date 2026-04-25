import { useMemo } from "react";
import { eachDayOfInterval, isToday, isWeekend, differenceInDays, parseISO } from "date-fns";
import { useDroppable } from "@dnd-kit/core";
import { DraggableBar } from "./DraggableBar";
import { computeLayout } from "./lane-layout";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails } from "@/hooks/useProductionSchedule";
import type { RowSize } from "@/pages/Schedule";

const LANE_HEIGHTS: Record<RowSize, number> = { compact: 28, default: 38, expanded: 48 };
const LANE_GAP = 3;
const ROW_PADDING = 6;
const MIN_ROW: Record<RowSize, number> = { compact: 44, default: 56, expanded: 72 };

interface Props {
  line: FactoryLine;
  schedules: ScheduleWithDetails[];
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
  rowSize: RowSize;
  onBarClick: (schedule: ScheduleWithDetails) => void;
  isEven: boolean;
}

export function TimelineRow({ line, schedules, visibleRange, viewMode, dayWidth, rowSize, onBarClick, isEven }: Props) {
  const days = eachDayOfInterval(visibleRange);
  const isEmpty = schedules.length === 0;

  const bars = useMemo(
    () => computeLayout(schedules, visibleRange.start, visibleRange.end),
    [schedules, visibleRange.start, visibleRange.end]
  );

  const maxLanes = useMemo(() => {
    let m = 0;
    for (const b of bars) if (b.totalLanes > m) m = b.totalLanes;
    return Math.max(m, 1);
  }, [bars]);

  const laneH = maxLanes === 1 ? LANE_HEIGHTS[rowSize] : Math.max(Math.floor(LANE_HEIGHTS[rowSize] * 0.72), 22);
  const rowH = Math.max(ROW_PADDING * 2 + maxLanes * laneH + Math.max(0, maxLanes - 1) * LANE_GAP, MIN_ROW[rowSize]);

  const hasRisk = useMemo(() =>
    schedules.some(s => s.status !== "completed" && s.workOrder.planned_ex_factory && parseISO(s.end_date) > parseISO(s.workOrder.planned_ex_factory)),
  [schedules]);

  const todayIdx = useMemo(() => {
    const o = differenceInDays(new Date(), visibleRange.start);
    return o >= 0 && o < days.length ? o : -1;
  }, [visibleRange.start, days.length]);

  // Droppable — the grid area is a drop target
  const { setNodeRef, isOver } = useDroppable({
    id: `line-${line.id}`,
    data: {
      type: "line-row",
      lineId: line.id,
      line,
      dayWidth,
      visibleStart: visibleRange.start,
    },
  });

  return (
    <div
      className={`flex group/row transition-colors duration-75
        ${isEven ? "bg-white" : "bg-slate-50/20"}
        ${!isEmpty ? "hover:bg-blue-50/[0.04]" : ""}
        ${isOver ? "bg-blue-50/20" : ""}
      `}
      style={{ height: rowH }}
    >
      {/* Line label */}
      <div className={`w-[148px] shrink-0 border-r border-slate-200 px-4 flex items-center gap-2 bg-slate-50 sticky left-0 z-20
        ${!isEmpty ? "border-l-[3px] border-l-blue-500/50" : "border-l-[3px] border-l-transparent"}
        ${isOver ? "border-l-blue-500 bg-blue-50/40" : ""}
      `}>
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-[12px] font-semibold tracking-tight ${isEmpty ? "text-slate-300" : "text-slate-700"}`}>
            {line.line_id}
          </span>
          {line.name && rowSize !== "compact" && (
            <span className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">{line.name}</span>
          )}
        </div>
        {hasRisk && <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
      </div>

      {/* Grid + bars */}
      <div ref={setNodeRef} className={`relative flex-1 border-b border-slate-100 ${isOver ? "ring-1 ring-inset ring-blue-400/30" : ""}`}>
        <div className="flex h-full">
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className={`h-full
                ${day.getDay() === 1 && i > 0 ? "border-l border-slate-200/50" : i > 0 ? "border-l border-slate-100/60" : ""}
                ${isWeekend(day) ? "bg-slate-50/40" : ""}
                ${isToday(day) ? "bg-blue-50/30" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            />
          ))}
        </div>

        {isEmpty && !isOver && (
          <div className="absolute inset-0 flex items-center pointer-events-none px-6">
            <div className="w-full border-t border-dashed border-slate-100" />
          </div>
        )}

        {isOver && isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-medium text-blue-400">Drop here to schedule</span>
          </div>
        )}

        {todayIdx >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-[1.5px] bg-blue-500/40 pointer-events-none z-10"
            style={{ left: todayIdx * dayWidth + dayWidth / 2 }}
          />
        )}

        {bars.map(bar => (
          <DraggableBar
            key={bar.schedule.id}
            bar={bar}
            dayWidth={dayWidth}
            rowPadding={ROW_PADDING}
            laneHeight={laneH}
            laneGap={LANE_GAP}
            onClick={() => onBarClick(bar.schedule)}
          />
        ))}
      </div>
    </div>
  );
}
