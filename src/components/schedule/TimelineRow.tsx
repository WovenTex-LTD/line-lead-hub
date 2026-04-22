import { useMemo } from "react";
import { eachDayOfInterval, isToday, isWeekend, differenceInDays, parseISO } from "date-fns";
import { ScheduleBarSegment } from "./ScheduleBarSegment";
import { computeSegments } from "./lane-layout";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails } from "@/hooks/useProductionSchedule";
import type { RowSize } from "@/pages/Schedule";

const LANE_HEIGHTS: Record<RowSize, number> = { compact: 30, default: 40, expanded: 50 };
const LANE_GAP = 3;
const ROW_PADDING = 6;
const MIN_ROW: Record<RowSize, number> = { compact: 44, default: 56, expanded: 68 };

interface Props {
  line: FactoryLine;
  schedules: ScheduleWithDetails[];
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
  rowSize: RowSize;
  onBarClick: (schedule: ScheduleWithDetails) => void;
  isLast: boolean;
}

export function TimelineRow({ line, schedules, visibleRange, viewMode, dayWidth, rowSize, onBarClick, isLast }: Props) {
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

  const laneH = maxLanes === 1 ? LANE_HEIGHTS[rowSize] : Math.max(Math.floor(LANE_HEIGHTS[rowSize] * 0.72), 24);
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
      className={`flex transition-colors duration-75 group/row
        ${isEmpty ? "bg-white" : "bg-white hover:bg-slate-50/40"}
        ${!isLast ? "border-b border-slate-100/80" : ""}
      `}
      style={{ height: rowH }}
    >
      {/* Line label */}
      <div className="w-[160px] shrink-0 border-r border-slate-200/60 px-4 flex items-center">
        <div className="flex flex-col min-w-0">
          <span className={`text-[13px] font-semibold tracking-tight ${isEmpty ? "text-slate-300" : "text-slate-800"}`}>
            {line.line_id}
          </span>
          {line.name && rowSize !== "compact" && (
            <span className="text-[10px] text-slate-400 truncate mt-0.5">{line.name}</span>
          )}
        </div>
        {hasRisk && <div className="w-1.5 h-1.5 rounded-full bg-red-500 ml-auto shrink-0" />}
      </div>

      {/* Grid */}
      <div className="relative flex-1">
        <div className="flex h-full">
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className={`h-full
                ${i > 0 ? "border-l border-slate-100/60" : ""}
                ${isWeekend(day) ? "bg-slate-50/30" : ""}
                ${isToday(day) ? "bg-blue-50/30" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            />
          ))}
        </div>

        {isEmpty && (
          <div className="absolute inset-0 flex items-center px-8 pointer-events-none">
            <div className="w-full border-t border-dashed border-slate-100" />
          </div>
        )}

        {todayIdx >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-[1.5px] bg-slate-900/15 pointer-events-none z-10"
            style={{ left: todayIdx * dayWidth + dayWidth / 2 }}
          />
        )}

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
