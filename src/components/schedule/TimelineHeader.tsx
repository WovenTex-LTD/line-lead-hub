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
    <div className="flex border-b border-slate-200 sticky top-0 z-20 bg-white">
      {/* Line column */}
      <div className="w-[168px] shrink-0 border-r border-slate-200 px-4 py-3 flex items-end bg-slate-50/80">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Production Line</span>
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
              className={`flex flex-col items-center justify-center py-2.5
                ${isMonday && i > 0 ? "border-l border-slate-200" : i > 0 ? "border-l border-slate-100" : ""}
                ${weekend ? "bg-slate-50/60" : "bg-slate-50/30"}
                ${todayCol ? "bg-blue-50/70" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            >
              <span className={`text-[9px] font-semibold uppercase tracking-wider leading-none
                ${todayCol ? "text-blue-600" : weekend ? "text-slate-300" : "text-slate-400"}
              `}>
                {isMonth ? format(day, "EEEEE") : format(day, "EEE")}
              </span>
              <div className="relative mt-1.5 w-7 h-7 flex items-center justify-center">
                {todayCol && (
                  <div className="absolute inset-0 rounded-full bg-blue-600 shadow-sm shadow-blue-600/30" />
                )}
                <span className={`relative ${isMonth ? "text-[10px]" : "text-[13px]"} font-bold tabular-nums leading-none
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
