import { useMemo } from "react";
import { eachDayOfInterval, format, isToday, isWeekend, parseISO, differenceInDays } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { ExFactoryDeadline } from "@/hooks/useProductionSchedule";

interface Props {
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
  deadlines: ExFactoryDeadline[];
}

export function TimelineHeader({ visibleRange, viewMode, dayWidth, deadlines }: Props) {
  const days = eachDayOfInterval(visibleRange);
  const isMonth = viewMode === "month";

  const deadlinesByDay = useMemo(() => {
    const map = new Map<number, ExFactoryDeadline>();
    for (const d of deadlines) {
      const date = parseISO(d.date);
      if (date >= visibleRange.start && date <= visibleRange.end) {
        map.set(differenceInDays(date, visibleRange.start), d);
      }
    }
    return map;
  }, [deadlines, visibleRange]);

  return (
    <div className="flex bg-slate-50/80 sticky top-0 z-20">
      <div className="w-[160px] shrink-0 border-r border-slate-200/60 px-4 py-3 flex items-end">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Line</span>
      </div>

      <div className="flex border-b border-slate-200/60">
        {days.map((day, i) => {
          const weekend = isWeekend(day);
          const todayCol = isToday(day);
          const deadline = deadlinesByDay.get(i);
          const hasDeadline = !!deadline;

          return (
            <div
              key={day.toISOString()}
              className={`flex flex-col items-center justify-end pb-2.5 pt-3 relative
                ${i > 0 ? "border-l border-slate-100/80" : ""}
                ${weekend ? "bg-slate-100/30" : ""}
                ${todayCol ? "bg-blue-50/50" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            >
              <span className={`text-[10px] font-medium tracking-wide
                ${todayCol ? "text-blue-500" : weekend ? "text-slate-300" : "text-slate-400"}
              `}>
                {isMonth ? format(day, "EEEEE") : format(day, "EEE")}
              </span>

              <div className="relative mt-1 flex items-center justify-center">
                {todayCol && <div className="absolute w-7 h-7 rounded-full bg-slate-900" />}
                <span className={`relative text-[13px] font-bold tabular-nums
                  ${todayCol ? "text-white" : weekend ? "text-slate-350" : "text-slate-700"}
                `}>
                  {format(day, "d")}
                </span>
              </div>

              {hasDeadline && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        deadline.workOrders.some(w => !w.isScheduled) ? "bg-red-500" : "bg-red-300"
                      }`} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="p-2.5 max-w-[200px]">
                    <p className="text-[11px] font-bold mb-1">Ex-Factory: {format(parseISO(deadline.date), "d MMM")}</p>
                    {deadline.workOrders.map(wo => (
                      <p key={wo.id} className="text-[10px] text-muted-foreground">
                        {wo.po_number} — {wo.buyer}
                        {!wo.isScheduled && <span className="text-amber-500 ml-1 font-medium">unscheduled</span>}
                      </p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
