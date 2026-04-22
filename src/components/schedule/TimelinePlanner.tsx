import { TimelineHeader } from "./TimelineHeader";
import { TimelineRow } from "./TimelineRow";
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
  const dayWidth = viewMode === "week" ? 128 : 42;

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: viewMode === "week" ? "auto" : 1300 }}>
          <TimelineHeader
            visibleRange={visibleRange}
            viewMode={viewMode}
            dayWidth={dayWidth}
            deadlines={deadlines}
          />

          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <p className="text-[13px] font-medium text-slate-400">No production lines configured</p>
              <p className="text-[12px] text-slate-300 mt-1">Set up lines in Factory Setup to begin scheduling</p>
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
                isLast={i === lines.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
