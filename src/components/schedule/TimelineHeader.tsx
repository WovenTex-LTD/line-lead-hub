import { eachDayOfInterval, format, isToday, isWeekend } from "date-fns";
import type { ViewMode } from "@/hooks/useTimelineState";

interface Props {
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
}

export function TimelineHeader({ visibleRange, viewMode, dayWidth }: Props) {
  const days = eachDayOfInterval(visibleRange);
  const isMonth = viewMode === "month";

  return (
    <div className="flex bg-slate-50/90 border-b border-slate-200 sticky top-0 z-20">
      {/* Line column header */}
      <div className="w-[176px] shrink-0 border-r border-slate-200 px-5 py-3 flex items-end bg-slate-50">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Line</span>
      </div>

      {/* Date columns */}
      <div className="flex">
        {days.map((day, i) => {
          const weekend = isWeekend(day);
          const todayCol = isToday(day);
          const isMonday = day.getDay() === 1;
          return (
            <div
              key={day.toISOString()}
              className={`flex flex-col items-center justify-center py-3
                ${isMonday && i > 0 ? "border-l border-slate-200/80" : "border-l border-slate-100"}
                ${weekend ? "bg-slate-100/40" : ""}
                ${todayCol ? "bg-blue-50/80" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            >
              <span className={`text-[9px] font-semibold uppercase tracking-wider
                ${todayCol ? "text-blue-500" : weekend ? "text-slate-400" : "text-slate-400"}
              `}>
                {isMonth ? format(day, "EEEEE") : format(day, "EEE")}
              </span>
              <div className="relative mt-1">
                {todayCol && (
                  <div className="absolute inset-0 -m-1.5 rounded-full bg-blue-600" />
                )}
                <span className={`relative ${isMonth ? "text-[10px]" : "text-[13px]"} font-bold tabular-nums
                  ${todayCol ? "text-white" : weekend ? "text-slate-400" : "text-slate-700"}
                `}>
                  {format(day, "d")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
