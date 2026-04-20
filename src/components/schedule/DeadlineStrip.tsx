import { useMemo } from "react";
import { eachDayOfInterval, format, parseISO, differenceInDays, isWeekend } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Flag } from "lucide-react";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { ExFactoryDeadline } from "@/hooks/useProductionSchedule";

interface Props {
  deadlines: ExFactoryDeadline[];
  visibleRange: { start: Date; end: Date };
  viewMode: ViewMode;
  dayWidth: number;
}

export function DeadlineStrip({ deadlines, visibleRange, viewMode, dayWidth }: Props) {
  const days = eachDayOfInterval(visibleRange);

  // Map deadlines to their pixel positions within the visible range
  const visibleDeadlines = useMemo(() => {
    return deadlines
      .filter((d) => {
        const date = parseISO(d.date);
        return date >= visibleRange.start && date <= visibleRange.end;
      })
      .map((d) => {
        const date = parseISO(d.date);
        const offset = differenceInDays(date, visibleRange.start);
        const left = offset * dayWidth + dayWidth / 2;
        const daysFromNow = differenceInDays(date, new Date());
        const isPast = daysFromNow < 0;
        const isUrgent = daysFromNow >= 0 && daysFromNow <= 14;
        const unscheduledCount = d.workOrders.filter((wo) => !wo.isScheduled).length;
        return { ...d, left, daysFromNow, isPast, isUrgent, unscheduledCount };
      });
  }, [deadlines, visibleRange, dayWidth]);

  if (visibleDeadlines.length === 0) return null;

  return (
    <div className="flex border-b border-slate-200 bg-gradient-to-r from-slate-50/80 to-white">
      {/* Label column */}
      <div className="w-[176px] shrink-0 border-r-2 border-slate-200 px-5 py-2 flex items-center bg-slate-50/80">
        <div className="flex items-center gap-1.5">
          <Flag className="h-3 w-3 text-red-400" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">Deadlines</span>
        </div>
      </div>

      {/* Deadline markers area */}
      <div className="relative flex-1" style={{ height: 32 }}>
        {/* Background grid columns for alignment */}
        <div className="flex h-full absolute inset-0">
          {days.map((day, i) => {
            const isMonday = day.getDay() === 1;
            return (
              <div
                key={day.toISOString()}
                className={`h-full
                  ${isMonday && i > 0 ? "border-l border-slate-200/80" : "border-l border-slate-100/70"}
                  ${isWeekend(day) ? "bg-slate-50/40" : ""}
                `}
                style={{ width: dayWidth, minWidth: dayWidth }}
              />
            );
          })}
        </div>

        {/* Deadline flags */}
        {visibleDeadlines.map((d) => {
          const totalPOs = d.workOrders.length;
          const color = d.isPast
            ? "bg-red-500 border-red-600"
            : d.isUrgent
              ? "bg-amber-500 border-amber-600"
              : "bg-slate-400 border-slate-500";

          const textColor = d.isPast
            ? "text-red-600"
            : d.isUrgent
              ? "text-amber-600"
              : "text-slate-500";

          return (
            <Tooltip key={d.date}>
              <TooltipTrigger asChild>
                <button
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0 z-10 cursor-default"
                  style={{ left: d.left }}
                >
                  {/* Diamond marker */}
                  <div className={`w-2.5 h-2.5 rounded-sm rotate-45 border ${color} shadow-sm`} />
                  {/* Count label */}
                  {totalPOs > 1 && (
                    <span className={`text-[8px] font-bold mt-0.5 ${textColor} tabular-nums`}>{totalPOs}</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold text-foreground">
                      Ex-Factory: {format(parseISO(d.date), "d MMM yyyy")}
                    </p>
                    {d.isPast && (
                      <span className="text-[9px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">OVERDUE</span>
                    )}
                  </div>
                  {d.unscheduledCount > 0 && (
                    <p className="text-[10px] font-medium text-amber-600">
                      {d.unscheduledCount} of {totalPOs} not yet scheduled
                    </p>
                  )}
                  <div className="h-px bg-border" />
                  <div className="space-y-1">
                    {d.workOrders.map((wo) => (
                      <div key={wo.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold text-foreground">{wo.po_number}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">{wo.buyer}</span>
                        </div>
                        {!wo.isScheduled && (
                          <span className="text-[8px] font-semibold text-amber-600 bg-amber-50 px-1 py-0.5 rounded shrink-0">UNSCHEDULED</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
