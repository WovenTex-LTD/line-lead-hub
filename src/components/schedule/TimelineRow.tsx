import { useMemo } from "react";
import { eachDayOfInterval, isToday, isWeekend, differenceInDays, parseISO } from "date-fns";
import { ScheduleBarSegment } from "./ScheduleBarSegment";
import { computeSegments } from "./lane-layout";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails } from "@/hooks/useProductionSchedule";
import type { RowSize } from "@/pages/Schedule";

const LANE_HEIGHTS: Record<RowSize, number> = {
  compact: 28,
  default: 38,
  expanded: 48,
};

const LANE_GAP = 2;
const ROW_PADDING = 5;
const MIN_ROW_HEIGHT: Record<RowSize, number> = {
  compact: 42,
  default: 56,
  expanded: 72,
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

  const segments = useMemo(
    () => computeSegments(schedules, visibleRange.start, visibleRange.end),
    [schedules, visibleRange.start, visibleRange.end]
  );

  const maxLanes = useMemo(() => {
    let max = 0;
    for (const seg of segments) {
      if (seg.totalLanes > max) max = seg.totalLanes;
    }
    return Math.max(max, 1);
  }, [segments]);

  const baseLaneHeight = LANE_HEIGHTS[rowSize];
  const laneHeight = maxLanes === 1 ? baseLaneHeight : Math.max(Math.floor(baseLaneHeight * 0.7), 22);
  const computedHeight = ROW_PADDING * 2 + maxLanes * laneHeight + Math.max(0, maxLanes - 1) * LANE_GAP;
  const rowHeight = Math.max(computedHeight, MIN_ROW_HEIGHT[rowSize]);

  const hasRisk = useMemo(() =>
    activeSchedules.some((s) => {
      if (!s.workOrder.planned_ex_factory) return false;
      return parseISO(s.end_date) > parseISO(s.workOrder.planned_ex_factory);
    }),
  [activeSchedules]);

  const todayIndex = useMemo(() => {
    const offset = differenceInDays(new Date(), visibleRange.start);
    return offset >= 0 && offset < days.length ? offset : -1;
  }, [visibleRange.start, days.length]);

  return (
    <div
      className={`flex group/row transition-colors duration-75
        ${isEven ? "bg-white" : "bg-slate-50/30"}
        hover:bg-blue-50/[0.06]
      `}
      style={{ height: rowHeight }}
    >
      {/* Line label */}
      <div className={`w-[176px] shrink-0 border-r border-slate-200 px-4 flex items-center gap-2.5 bg-slate-50/50
        ${!isEmpty ? "border-l-[3px] border-l-blue-400/60" : "border-l-[3px] border-l-transparent"}
      `}>
        <div className="flex flex-col min-w-0">
          <span className={`text-[12px] font-bold tracking-tight ${isEmpty ? "text-slate-350" : "text-slate-700"}`}>
            {line.line_id}
          </span>
          {line.name && rowSize !== "compact" && (
            <span className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">{line.name}</span>
          )}
        </div>
        {hasRisk && (
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Ex-factory risk" />
        )}
      </div>

      {/* Grid + bars */}
      <div className="relative flex-1 border-b border-slate-100/80">
        <div className="flex h-full">
          {days.map((day, i) => {
            const weekend = isWeekend(day);
            const isMonday = day.getDay() === 1;
            return (
              <div
                key={day.toISOString()}
                className={`h-full
                  ${isMonday && i > 0 ? "border-l border-slate-200/60" : "border-l border-slate-100/50"}
                  ${weekend ? "bg-slate-50/50" : ""}
                `}
                style={{ width: dayWidth, minWidth: dayWidth }}
              />
            );
          })}
        </div>

        {isEmpty && (
          <div className="absolute inset-0 flex items-center pointer-events-none px-6">
            <div className="w-full border-t border-dashed border-slate-150" />
          </div>
        )}

        {todayIndex >= 0 && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{ left: todayIndex * dayWidth + dayWidth / 2 - 0.75 }}
          >
            <div className="w-[1.5px] h-full bg-blue-500/50" />
            <div className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-[7px] h-[7px] rounded-full bg-blue-500 border-2 border-white" />
          </div>
        )}

        {segments.map((seg) => (
          <ScheduleBarSegment
            key={`${seg.scheduleId}-${seg.startDay}`}
            segment={seg}
            dayWidth={dayWidth}
            rowPadding={ROW_PADDING}
            laneHeight={laneHeight}
            laneGap={LANE_GAP}
            onClick={() => onBarClick(seg.schedule)}
          />
        ))}
      </div>
    </div>
  );
}
