import { useMemo } from "react";
import { eachDayOfInterval, isToday, isWeekend, differenceInDays, parseISO } from "date-fns";
import { ScheduleBar } from "./ScheduleBar";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails } from "@/hooks/useProductionSchedule";
import type { RowSize } from "@/pages/Schedule";

const ROW_HEIGHTS: Record<RowSize, number> = {
  compact: 48,
  default: 68,
  expanded: 96,
};

const BAR_CONFIG: Record<RowSize, { top: number; height: number }> = {
  compact: { top: 6, height: 36 },
  default: { top: 12, height: 44 },
  expanded: { top: 14, height: 52 },
};

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
  const activeSchedules = schedules.filter((s) => s.status !== "completed");
  const rowHeight = ROW_HEIGHTS[rowSize];
  const barConfig = BAR_CONFIG[rowSize];

  // Detect risk state for the row
  const hasRisk = useMemo(() =>
    activeSchedules.some((s) => {
      if (!s.workOrder.planned_ex_factory) return false;
      return parseISO(s.end_date) > parseISO(s.workOrder.planned_ex_factory);
    }),
  [activeSchedules]);

  // Today column index for marker
  const todayIndex = useMemo(() => {
    const todayOffset = differenceInDays(new Date(), visibleRange.start);
    return todayOffset >= 0 && todayOffset < days.length ? todayOffset : -1;
  }, [visibleRange.start, days.length]);

  return (
    <div
      className={`flex group/row transition-colors duration-100
        ${isEven ? "bg-white" : "bg-slate-25"}
        ${hasRisk ? "bg-red-50/20" : ""}
        ${isEmpty ? "" : "hover:bg-blue-50/20"}
      `}
      style={{ height: rowHeight }}
    >
      {/* Fixed line label column */}
      <div className={`w-[176px] shrink-0 border-r-2 border-slate-200 px-5 flex items-center gap-3
        ${isEmpty ? "bg-slate-50/60" : "bg-slate-50/80"}
      `}>
        <div className="flex flex-col min-w-0">
          <span className={`text-[13px] font-bold tracking-tight ${isEmpty ? "text-slate-400" : "text-slate-800"}`}>
            {line.line_id}
          </span>
          {line.name && rowSize !== "compact" && (
            <span className="text-[10px] text-slate-400 truncate leading-tight">{line.name}</span>
          )}
        </div>
        {hasRisk && (
          <div className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" title="Ex-factory risk" />
        )}
      </div>

      {/* Grid area */}
      <div className="relative flex-1 border-b border-slate-100">
        {/* Day column grid */}
        <div className="flex h-full">
          {days.map((day, i) => {
            const weekend = isWeekend(day);
            const isMonday = day.getDay() === 1;
            const todayCol = i === todayIndex;
            return (
              <div
                key={day.toISOString()}
                className={`h-full
                  ${isMonday && i > 0 ? "border-l border-slate-200/80" : "border-l border-slate-100/70"}
                  ${weekend ? "bg-slate-50/60" : ""}
                  ${todayCol ? "bg-blue-50/50" : ""}
                `}
                style={{ width: dayWidth, minWidth: dayWidth }}
              />
            );
          })}
        </div>

        {/* Idle line indicator */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center pointer-events-none px-4">
            <div className="w-full border-t border-dashed border-slate-200/50" />
          </div>
        )}

        {/* Today vertical marker */}
        {todayIndex >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-blue-500/60 pointer-events-none z-10"
            style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
          >
            <div className="absolute inset-0 w-[6px] -ml-[2px] bg-blue-400/10 blur-[2px]" />
          </div>
        )}

        {/* Schedule bars */}
        {schedules.map((s) => (
          <ScheduleBar
            key={s.id}
            schedule={s}
            visibleStart={visibleRange.start}
            visibleEnd={visibleRange.end}
            dayWidth={dayWidth}
            barTop={barConfig.top}
            barHeight={barConfig.height}
            onClick={() => onBarClick(s)}
          />
        ))}
      </div>
    </div>
  );
}
