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

type BarTheme = { bg: string; text: string; hoverBg: string };

function getTheme(schedule: ScheduleWithDetails): BarTheme {
  if (schedule.status === "completed") {
    return { bg: "bg-slate-100", text: "text-slate-400", hoverBg: "hover:bg-slate-200/80" };
  }
  const ex = schedule.workOrder.planned_ex_factory;
  if (ex) {
    const end = parseISO(schedule.end_date);
    const exDate = parseISO(ex);
    if (isAfter(end, exDate)) return { bg: "bg-rose-500", text: "text-white", hoverBg: "hover:bg-rose-600" };
    if (differenceInDays(exDate, end) <= 7) return { bg: "bg-amber-500", text: "text-white", hoverBg: "hover:bg-amber-600" };
  }
  if (schedule.colour) return { bg: "", text: "text-white", hoverBg: "" };
  return { bg: "bg-blue-500", text: "text-white", hoverBg: "hover:bg-blue-600" };
}

export function ScheduleBarSegment({ segment, dayWidth, rowPadding, laneHeight, laneGap, onClick }: Props) {
  const { schedule, startDay, endDay, lane, isFirstSegment, isLastSegment } = segment;
  const theme = getTheme(schedule);
  const isCompleted = schedule.status === "completed";

  // Position
  const left = startDay * dayWidth + 2;
  const width = (endDay - startDay + 1) * dayWidth - 4;
  const top = rowPadding + lane * (laneHeight + laneGap);

  // Rounding
  const single = isFirstSegment && isLastSegment;
  const r = single ? "rounded-lg" : isFirstSegment ? "rounded-l-lg" : isLastSegment ? "rounded-r-lg" : "";

  // Text
  const showPO = width > 48;
  const showBuyer = width > 110 && laneHeight >= 32;

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
            ${theme.bg} ${theme.text} ${theme.hoverBg} ${r}
            ${isCompleted ? "opacity-40" : "shadow-[0_1px_2px_rgba(0,0,0,0.08)]"}
            transition-all duration-150 hover:shadow-md hover:z-20
          `}
          style={{
            top, left, width: Math.max(width, 6), height: laneHeight,
            ...(schedule.colour && !isCompleted ? { backgroundColor: schedule.colour } : {}),
          }}
          onClick={onClick}
        >
          {showPO && (
            <div className="flex flex-col justify-center h-full px-3 min-w-0">
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
      <TooltipContent side="top" className="p-3 max-w-[220px] shadow-lg">
        <p className="text-[13px] font-bold">{schedule.workOrder.po_number}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{schedule.workOrder.buyer} · {schedule.workOrder.style}</p>
        <div className="h-px bg-border my-2" />
        <p className="text-[11px]">{format(s, "d MMM")} → {format(e, "d MMM yyyy")}</p>
        <p className="text-[11px] text-muted-foreground">{differenceInDays(e, s) + 1} days · {schedule.workOrder.order_qty?.toLocaleString()} pcs</p>
        {daysLeft !== null && (
          <p className={`text-[11px] font-semibold mt-1 ${daysLeft <= 0 ? "text-red-600" : daysLeft <= 7 ? "text-amber-600" : "text-emerald-600"}`}>
            {daysLeft <= 0 ? `${Math.abs(daysLeft)}d past deadline` : `${daysLeft}d to ex-factory`}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
