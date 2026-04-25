import { useRef, useEffect, useCallback } from "react";
import { addDays, format } from "date-fns";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineRow } from "./TimelineRow";
import { DeadlineStrip } from "./DeadlineStrip";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails, ExFactoryDeadline } from "@/hooks/useProductionSchedule";
import type { RowSize } from "@/pages/Schedule";

interface Props {
  lines: FactoryLine[];
  schedulesByLine: Map<string, ScheduleWithDetails[]>;
  deadlines: ExFactoryDeadline[];
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  rowSize: RowSize;
  todayOffset: number;
  onBarClick: (schedule: ScheduleWithDetails) => void;
  onVisibleMonthChange?: (label: string) => void;
}

export function TimelinePlanner({ lines, schedulesByLine, deadlines, visibleRange, viewMode, rowSize, todayOffset, onBarClick, onVisibleMonthChange }: Props) {
  const dayWidth = viewMode === "week" ? 120 : 52;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineColumnWidth = 148;

  // Auto-scroll to today (second column) on mount and when anchor changes
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = (todayOffset - 1) * dayWidth;
      scrollRef.current.scrollLeft = Math.max(0, scrollTo);
    }
  }, [todayOffset, dayWidth]);

  // Track scroll position to update visible month label
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !onVisibleMonthChange) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    // The center of the viewport determines the visible month
    const viewportCenter = scrollLeft + scrollRef.current.clientWidth / 2 - lineColumnWidth;
    const dayIndex = Math.floor(Math.max(0, viewportCenter) / dayWidth);
    const centerDate = addDays(visibleRange.start, dayIndex);
    onVisibleMonthChange(format(centerDate, "MMMM yyyy"));
  }, [dayWidth, visibleRange.start, lineColumnWidth, onVisibleMonthChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Fire once on mount to set initial label
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div className="rounded-xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: lineColumnWidth + (105 * dayWidth) }}>
          <TimelineHeader visibleRange={visibleRange} viewMode={viewMode} dayWidth={dayWidth} />

          <DeadlineStrip
            deadlines={deadlines}
            visibleRange={visibleRange}
            viewMode={viewMode}
            dayWidth={dayWidth}
          />

          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center">
              <p className="text-[13px] font-medium text-slate-400">No active production lines</p>
              <p className="text-[11px] text-slate-300 mt-1">Add lines in Factory Setup to start scheduling</p>
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
                rowSize={rowSize}
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
