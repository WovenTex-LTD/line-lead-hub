import { parseISO, differenceInDays, isAfter } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import type { ScheduleWithDetails } from "@/hooks/useProductionSchedule";

interface Props {
  schedule: ScheduleWithDetails;
  visibleStart: Date;
  visibleEnd: Date;
  dayWidth: number;
  barTop?: number;
  barHeight?: number;
  onClick: () => void;
}

function getBarStyles(schedule: ScheduleWithDetails): { bg: string; text: string; border: string } {
  if (schedule.status === "completed") {
    return { bg: "bg-slate-100", text: "text-slate-400", border: "border-slate-200" };
  }
  if (schedule.colour) {
    return { bg: "", text: "text-white", border: "border-transparent" };
  }
  const exFactory = schedule.workOrder.planned_ex_factory;
  if (exFactory) {
    const endDate = parseISO(schedule.end_date);
    const exDate = parseISO(exFactory);
    if (isAfter(endDate, exDate)) {
      return { bg: "bg-gradient-to-r from-red-500 to-red-600", text: "text-white", border: "border-red-600/20" };
    }
    const daysToEx = differenceInDays(exDate, endDate);
    if (daysToEx <= 7) {
      return { bg: "bg-gradient-to-r from-amber-500 to-amber-600", text: "text-white", border: "border-amber-600/20" };
    }
  }
  return { bg: "bg-gradient-to-r from-blue-500 to-blue-600", text: "text-white", border: "border-blue-700/10" };
}

export function ScheduleBar({ schedule, visibleStart, visibleEnd, dayWidth, barTop = 12, barHeight = 44, onClick }: Props) {
  const start = parseISO(schedule.start_date);
  const end = parseISO(schedule.end_date);

  const offsetDays = Math.max(0, differenceInDays(start, visibleStart));
  const clippedStart = start < visibleStart ? visibleStart : start;
  const clippedEnd = end > visibleEnd ? visibleEnd : end;
  const durationDays = differenceInDays(clippedEnd, clippedStart) + 1;

  const left = offsetDays * dayWidth;
  const width = Math.max(durationDays * dayWidth - 6, dayWidth * 0.6);

  const styles = getBarStyles(schedule);
  const isDelayed = schedule.status === "delayed";
  const isCompleted = schedule.status === "completed";
  const startsBeforeView = start < visibleStart;
  const endsAfterView = end > visibleEnd;

  // Ex-factory deadline marker
  const exFactory = schedule.workOrder.planned_ex_factory;
  let exMarkerLeft: number | null = null;
  if (exFactory) {
    const exDate = parseISO(exFactory);
    const exOffset = differenceInDays(exDate, visibleStart);
    const maxOffset = differenceInDays(visibleEnd, visibleStart);
    if (exOffset >= 0 && exOffset <= maxOffset) {
      exMarkerLeft = exOffset * dayWidth + dayWidth / 2;
    }
  }

  const daysRemaining = exFactory ? differenceInDays(parseISO(exFactory), new Date()) : null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`absolute shadow-sm cursor-pointer
              transition-all duration-200 ease-out
              hover:shadow-lg hover:scale-[1.01] hover:brightness-105
              flex items-center overflow-hidden
              border ${styles.border} ${styles.bg} ${styles.text}
              ${isDelayed ? "ring-2 ring-red-400/40 ring-offset-1" : ""}
              ${isCompleted ? "opacity-50" : ""}
              ${startsBeforeView ? "rounded-l-none" : "rounded-l-lg"}
              ${endsAfterView ? "rounded-r-none" : "rounded-r-lg"}
            `}
            style={{
              top: barTop,
              height: barHeight,
              left: `${left + 3}px`,
              width: `${width}px`,
              ...(schedule.colour && !isCompleted ? { backgroundColor: schedule.colour } : {}),
            }}
            onClick={onClick}
          >
            {/* Content with refined typography */}
            <div className="flex flex-col justify-center px-3 py-1 min-w-0 w-full">
              <span className="text-[11px] font-bold tracking-wide truncate leading-tight">
                {schedule.workOrder.po_number}
              </span>
              <span className={`text-[9px] truncate leading-tight mt-0.5 ${isCompleted ? "opacity-60" : "opacity-75"}`}>
                {schedule.workOrder.buyer} · {schedule.workOrder.style}
              </span>
            </div>

            {/* Delayed indicator stripe */}
            {isDelayed && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-l-lg" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] p-3">
          <div className="space-y-1.5">
            <p className="font-bold text-[13px] text-foreground">{schedule.workOrder.po_number}</p>
            <p className="text-[11px] text-muted-foreground">{schedule.workOrder.buyer} · {schedule.workOrder.style}</p>
            <div className="h-px bg-border my-1.5" />
            <p className="text-[11px] text-foreground">{format(start, "d MMM")} → {format(end, "d MMM yyyy")}</p>
            <p className="text-[11px] text-muted-foreground">{differenceInDays(end, start) + 1} days · {schedule.workOrder.order_qty?.toLocaleString()} pcs</p>
            {daysRemaining !== null && (
              <p className={`text-[11px] font-semibold ${daysRemaining <= 0 ? "text-red-600" : daysRemaining <= 7 ? "text-amber-600" : "text-emerald-600"}`}>
                {daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d past ex-factory` : `${daysRemaining}d to ex-factory`}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Ex-factory deadline marker — minimal tick */}
      {exMarkerLeft !== null && !isCompleted && (
        <div
          className="absolute pointer-events-none z-[5] flex flex-col items-center"
          style={{ top: Math.max(barTop - 4, 2), left: `${exMarkerLeft - 1}px` }}
        >
          <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-red-400/70" />
          <div className="w-[1.5px] h-[6px] bg-red-400/50" />
        </div>
      )}
    </>
  );
}
