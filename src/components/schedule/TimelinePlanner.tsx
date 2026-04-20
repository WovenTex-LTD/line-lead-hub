import { format } from "date-fns";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineRow } from "./TimelineRow";
import { DeadlineStrip } from "./DeadlineStrip";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine, ScheduleWithDetails, ExFactoryDeadline } from "@/hooks/useProductionSchedule";

interface Props {
  lines: FactoryLine[];
  schedulesByLine: Map<string, ScheduleWithDetails[]>;
  deadlines: ExFactoryDeadline[];
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  onBarClick: (schedule: ScheduleWithDetails) => void;
}

export function TimelinePlanner({ lines, schedulesByLine, deadlines, visibleRange, viewMode, onBarClick }: Props) {
  const dayWidth = viewMode === "week" ? 120 : 40;

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm ring-1 ring-slate-900/[0.03]">
      {/* Month/week label bar */}
      <div className="flex items-center border-b border-slate-100 bg-slate-50/60">
        <div className="w-[176px] shrink-0 border-r-2 border-slate-200" />
        <div className="px-4 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {viewMode === "week"
              ? `Week of ${format(visibleRange.start, "d MMMM yyyy")}`
              : format(visibleRange.start, "MMMM yyyy")
            }
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: viewMode === "week" ? "auto" : 1240 }}>
          <TimelineHeader visibleRange={visibleRange} viewMode={viewMode} dayWidth={dayWidth} />

          {/* Deadline strip — shows all ex-factory dates as markers */}
          <DeadlineStrip
            deadlines={deadlines}
            visibleRange={visibleRange}
            viewMode={viewMode}
            dayWidth={dayWidth}
          />

          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-center">
              <p className="text-sm font-medium text-slate-400">No active production lines</p>
              <p className="text-[11px] text-slate-350 mt-1">Add lines in Factory Setup to start scheduling</p>
            </div>
          ) : (
            <div>
              {lines.map((line, i) => (
                <TimelineRow
                  key={line.id}
                  line={line}
                  schedules={schedulesByLine.get(line.id) ?? []}
                  visibleRange={visibleRange}
                  viewMode={viewMode}
                  dayWidth={dayWidth}
                  onBarClick={onBarClick}
                  isEven={i % 2 === 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
