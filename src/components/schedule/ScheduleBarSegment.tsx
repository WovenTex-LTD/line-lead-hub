import { parseISO, differenceInDays, isAfter, format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScheduleWithDetails } from "@/hooks/useProductionSchedule";
import type { BarSegment } from "./lane-layout";

interface Props {
  segment: BarSegment;
  dayWidth: number;
  rowPadding: number;
  laneHeight: number;
  laneGap: number;
  onClick: () => void;
}

function getBarClasses(schedule: ScheduleWithDetails): string {
  if (schedule.status === "completed") {
    return "bg-slate-200/80 text-slate-500 border-slate-300/50";
  }
  if (schedule.colour) {
    return "text-white border-white/10";
  }
  const exFactory = schedule.workOrder.planned_ex_factory;
  if (exFactory) {
    const endDate = parseISO(schedule.end_date);
    const exDate = parseISO(exFactory);
    if (isAfter(endDate, exDate)) {
      return "bg-gradient-to-b from-red-500 to-red-600 text-white border-red-700/20";
    }
    if (differenceInDays(exDate, endDate) <= 7) {
      return "bg-gradient-to-b from-amber-500 to-amber-600 text-white border-amber-700/20";
    }
  }
  return "bg-gradient-to-b from-blue-500 to-blue-600 text-white border-blue-700/15";
}

export function ScheduleBarSegment({ segment, dayWidth, rowPadding, laneHeight, laneGap, onClick }: Props) {
  const { schedule, startDay, endDay, lane, totalLanes, isFirstSegment, isLastSegment } = segment;
  const isDelayed = schedule.status === "delayed";
  const isCompleted = schedule.status === "completed";
  const barClasses = getBarClasses(schedule);

  // Horizontal: edge-to-edge within the day grid, 1px inset to prevent bleed
  const left = startDay * dayWidth + 1;
  const durationDays = endDay - startDay + 1;
  const width = durationDays * dayWidth - 2;

  // Vertical: positioned within lane
  const top = rowPadding + lane * (laneHeight + laneGap);

  // Rounding logic
  const isSingleSegment = isFirstSegment && isLastSegment;
  const rounding = isSingleSegment
    ? "rounded-lg"
    : isFirstSegment
      ? "rounded-l-lg rounded-r-none"
      : isLastSegment
        ? "rounded-r-lg rounded-l-none"
        : "rounded-none";

  // Text visibility based on width
  const showPO = width > 50;
  const showSecondary = width > 120 && laneHeight >= 32;

  // Tooltip data
  const schedStart = parseISO(schedule.start_date);
  const schedEnd = parseISO(schedule.end_date);
  const exFactory = schedule.workOrder.planned_ex_factory;
  const daysRemaining = exFactory ? differenceInDays(parseISO(exFactory), new Date()) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`absolute cursor-pointer overflow-hidden border
            shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)]
            transition-all duration-150 ease-out
            hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:z-30 hover:brightness-110
            ${barClasses} ${rounding}
            ${isDelayed ? "ring-2 ring-red-400/50 ring-offset-1" : ""}
            ${isCompleted ? "opacity-45" : ""}
          `}
          style={{
            top,
            height: laneHeight,
            left,
            width: Math.max(width, 8),
            ...(schedule.colour && !isCompleted ? { backgroundColor: schedule.colour } : {}),
          }}
          onClick={onClick}
        >
          {/* Inner top highlight for glass effect */}
          {!isCompleted && (
            <div className={`absolute inset-x-0 top-0 h-[1px] bg-white/20 ${rounding}`} />
          )}

          {showPO && (
            <div className="flex flex-col justify-center px-2.5 min-w-0 w-full h-full">
              <span className="text-[11px] font-semibold truncate leading-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">
                {schedule.workOrder.po_number}
              </span>
              {showSecondary && (
                <span className="text-[9px] opacity-80 truncate leading-tight mt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">
                  {schedule.workOrder.buyer} · {schedule.workOrder.style}
                </span>
              )}
            </div>
          )}

          {/* Delayed left accent */}
          {isDelayed && isFirstSegment && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-700" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] p-3 shadow-xl">
        <div className="space-y-1.5">
          <p className="font-bold text-[13px] text-foreground">{schedule.workOrder.po_number}</p>
          <p className="text-[11px] text-muted-foreground">{schedule.workOrder.buyer} · {schedule.workOrder.style}</p>
          <div className="h-px bg-border my-1.5" />
          <p className="text-[11px] text-foreground">{format(schedStart, "d MMM")} → {format(schedEnd, "d MMM yyyy")}</p>
          <p className="text-[11px] text-muted-foreground">{differenceInDays(schedEnd, schedStart) + 1} days · {schedule.workOrder.order_qty?.toLocaleString()} pcs</p>
          {daysRemaining !== null && (
            <p className={`text-[11px] font-semibold ${daysRemaining <= 0 ? "text-red-600" : daysRemaining <= 7 ? "text-amber-600" : "text-emerald-600"}`}>
              {daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d past ex-factory` : `${daysRemaining}d to ex-factory`}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
