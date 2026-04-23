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

function getBarStyle(schedule: ScheduleWithDetails): { bg: string; text: string } {
  if (schedule.status === "completed") {
    return { bg: "bg-slate-200/70", text: "text-slate-500" };
  }
  if (schedule.colour) {
    return { bg: "", text: "text-white" };
  }
  const ex = schedule.workOrder.planned_ex_factory;
  if (ex) {
    const end = parseISO(schedule.end_date);
    const exDate = parseISO(ex);
    if (isAfter(end, exDate)) return { bg: "bg-gradient-to-r from-red-500 to-red-600", text: "text-white" };
    if (differenceInDays(exDate, end) <= 7) return { bg: "bg-gradient-to-r from-amber-500 to-amber-600", text: "text-white" };
  }
  return { bg: "bg-gradient-to-r from-blue-500 to-blue-600", text: "text-white" };
}

export function ScheduleBarSegment({ segment, dayWidth, rowPadding, laneHeight, laneGap, onClick }: Props) {
  const { schedule, startDay, endDay, lane, isFirstSegment, isLastSegment } = segment;
  const isCompleted = schedule.status === "completed";
  const isDelayed = schedule.status === "delayed";
  const style = getBarStyle(schedule);

  // Position
  const left = startDay * dayWidth + 2;
  const width = (endDay - startDay + 1) * dayWidth - 4;
  const top = rowPadding + lane * (laneHeight + laneGap);

  // Rounding
  const single = isFirstSegment && isLastSegment;
  const r = single ? "rounded-md" : isFirstSegment ? "rounded-l-md" : isLastSegment ? "rounded-r-md" : "";

  // Text
  const showPO = width > 48;
  const showBuyer = width > 110 && laneHeight >= 30;

  // Tooltip
  const s = parseISO(schedule.start_date);
  const e = parseISO(schedule.end_date);
  const ex = schedule.workOrder.planned_ex_factory;
  const daysLeft = ex ? differenceInDays(parseISO(ex), new Date()) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`absolute cursor-pointer overflow-hidden
            ${style.bg} ${style.text} ${r}
            ${isCompleted ? "opacity-40" : "shadow-sm hover:shadow-md"}
            ${isDelayed ? "ring-1 ring-red-400/40 ring-offset-1" : ""}
            transition-all duration-150 hover:z-20 hover:brightness-105
          `}
          style={{
            top, left, height: laneHeight, width: Math.max(width, 6),
            ...(schedule.colour && !isCompleted ? { backgroundColor: schedule.colour } : {}),
          }}
          onClick={onClick}
        >
          {showPO && (
            <div className="flex flex-col justify-center h-full px-2.5 min-w-0">
              <span className="text-[11px] font-semibold truncate leading-none">
                {schedule.workOrder.po_number}
              </span>
              {showBuyer && (
                <span className="text-[9px] opacity-75 truncate leading-none mt-1">
                  {schedule.workOrder.buyer}
                </span>
              )}
            </div>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[230px] p-3">
        <p className="text-[13px] font-bold">{schedule.workOrder.po_number}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{schedule.workOrder.buyer} · {schedule.workOrder.style}</p>
        <div className="h-px bg-border my-2" />
        <p className="text-[11px]">{format(s, "d MMM")} → {format(e, "d MMM yyyy")}</p>
        <p className="text-[11px] text-muted-foreground">{differenceInDays(e, s) + 1} days · {schedule.workOrder.order_qty?.toLocaleString()} pcs</p>
        {daysLeft !== null && (
          <p className={`text-[11px] font-semibold mt-1 ${daysLeft <= 0 ? "text-red-600" : daysLeft <= 7 ? "text-amber-600" : "text-emerald-600"}`}>
            {daysLeft <= 0 ? `${Math.abs(daysLeft)}d past ex-factory` : `${daysLeft}d to ex-factory`}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
