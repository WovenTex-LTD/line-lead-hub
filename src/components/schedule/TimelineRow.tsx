import { useMemo } from "react";
import { eachDayOfInterval, isToday, isWeekend, differenceInDays, parseISO } from "date-fns";
import { ScheduleBarSegment } from "./ScheduleBarSegment";
import { computeSegments } from "./lane-layout";
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

  const segments = useMemo(
    () => computeSegments(schedules, visibleRange.start, visibleRange.end),
    [schedules, visibleRange.start, visibleRange.end]
  );

  const maxLanes = useMemo(() => {
    let m = 0;
    for (const s of segments) if (s.totalLanes > m) m = s.totalLanes;
    return Math.max(m, 1);
  }, [segments]);

  const laneH = maxLanes === 1 ? LANE_HEIGHTS[rowSize] : Math.max(Math.floor(LANE_HEIGHTS[rowSize] * 0.72), 22);
  const rowH = Math.max(ROW_PADDING * 2 + maxLanes * laneH + Math.max(0, maxLanes - 1) * LANE_GAP, MIN_ROW[rowSize]);

  const hasRisk = useMemo(() =>
    schedules.some(s => s.status !== "completed" && s.workOrder.planned_ex_factory && parseISO(s.end_date) > parseISO(s.workOrder.planned_ex_factory)),
  [schedules]);

  const todayIdx = useMemo(() => {
    const o = differenceInDays(new Date(), visibleRange.start);
    return o >= 0 && o < days.length ? o : -1;
  }, [visibleRange.start, days.length]);

  return (
    <div
      className={`flex group/row transition-colors duration-75
        ${isEven ? "bg-white" : "bg-slate-50/20"}
        ${!isEmpty ? "hover:bg-blue-50/[0.04]" : ""}
      `}
      style={{ height: rowH }}
    >
      {/* Line label column */}
      <div className={`w-[168px] shrink-0 border-r border-slate-200 px-4 flex items-center gap-2 bg-slate-50/40
        ${!isEmpty ? "border-l-[3px] border-l-blue-500/50" : "border-l-[3px] border-l-transparent"}
      `}>
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-[12px] font-semibold tracking-tight ${isEmpty ? "text-slate-300" : "text-slate-700"}`}>
            {line.line_id}
          </span>
          {line.name && rowSize !== "compact" && (
            <span className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">{line.name}</span>
          )}
        </div>
        {hasRisk && (
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        )}
      </div>

      {/* Grid + bars */}
      <div className="relative flex-1 border-b border-slate-100">
        {/* Column grid */}
        <div className="flex h-full">
          {days.map((day, i) => {
            const isMonday = day.getDay() === 1;
            return (
              <div
                key={day.toISOString()}
                className={`h-full
                  ${isMonday && i > 0 ? "border-l border-slate-200/50" : i > 0 ? "border-l border-slate-100/60" : ""}
                  ${isWeekend(day) ? "bg-slate-50/40" : ""}
                  ${isToday(day) ? "bg-blue-50/30" : ""}
                `}
                style={{ width: dayWidth, minWidth: dayWidth }}
              />
            );
          })}
        </div>

        {/* Empty row dashed line */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center pointer-events-none px-6">
            <div className="w-full border-t border-dashed border-slate-100" />
          </div>
        )}

        {/* Today vertical marker */}
        {todayIdx >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-[1.5px] bg-blue-500/40 pointer-events-none z-10"
            style={{ left: todayIdx * dayWidth + dayWidth / 2 }}
          />
        )}

        {/* Schedule bar segments */}
        {segments.map(seg => (
          <ScheduleBarSegment
            key={`${seg.scheduleId}-${seg.startDay}`}
            segment={seg}
            dayWidth={dayWidth}
            rowPadding={ROW_PADDING}
            laneHeight={laneH}
            laneGap={LANE_GAP}
            onClick={() => onBarClick(seg.schedule)}
          />
        ))}
      </div>
    </div>
  );
}
