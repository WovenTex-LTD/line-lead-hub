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
  onBarClick: (schedule: ScheduleWithDetails) => void;
}

export function TimelinePlanner({ lines, schedulesByLine, deadlines, visibleRange, viewMode, rowSize, onBarClick }: Props) {
  const dayWidth = viewMode === "week" ? 120 : 40;

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: viewMode === "week" ? "auto" : 1240 }}>
          <TimelineHeader visibleRange={visibleRange} viewMode={viewMode} dayWidth={dayWidth} />

          <DeadlineStrip
            deadlines={deadlines}
            visibleRange={visibleRange}
            viewMode={viewMode}
            dayWidth={dayWidth}
          />

          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-center">
              <p className="text-sm font-medium text-slate-400">No active production lines</p>
              <p className="text-[11px] text-slate-400 mt-1">Add lines in Factory Setup to start scheduling</p>
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
