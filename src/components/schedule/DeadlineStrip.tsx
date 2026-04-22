import { useMemo } from "react";
import { eachDayOfInterval, format, parseISO, differenceInDays, isWeekend, isSameDay } from "date-fns";
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

interface DeadlineCard {
  id: string;
  po_number: string;
  buyer: string;
  style: string;
  order_qty: number;
  isScheduled: boolean;
  date: string;
  dayOffset: number;
  daysFromNow: number;
  isPast: boolean;
  isUrgent: boolean;
}

export function DeadlineStrip({ deadlines, visibleRange, viewMode, dayWidth }: Props) {
  const days = eachDayOfInterval(visibleRange);
  const isMonth = viewMode === "month";

  // Flatten all POs into individual cards positioned at their ex-factory date
  const cards: DeadlineCard[] = useMemo(() => {
    const result: DeadlineCard[] = [];
    for (const d of deadlines) {
      const date = parseISO(d.date);
      if (date < visibleRange.start || date > visibleRange.end) continue;
      const dayOffset = differenceInDays(date, visibleRange.start);
      const daysFromNow = differenceInDays(date, new Date());
      const isPast = daysFromNow < 0;
      const isUrgent = daysFromNow >= 0 && daysFromNow <= 14;

      for (const wo of d.workOrders) {
        result.push({
          ...wo,
          date: d.date,
          dayOffset,
          daysFromNow,
          isPast,
          isUrgent,
        });
      }
    }
    return result;
  }, [deadlines, visibleRange]);

  // Group cards by day column for stacking
  const cardsByDay = useMemo(() => {
    const map = new Map<number, DeadlineCard[]>();
    for (const card of cards) {
      const list = map.get(card.dayOffset) ?? [];
      list.push(card);
      map.set(card.dayOffset, list);
    }
    return map;
  }, [cards]);

  // Calculate row height based on max stack
  const maxStack = useMemo(() => {
    let max = 0;
    for (const list of cardsByDay.values()) {
      if (list.length > max) max = list.length;
    }
    return max;
  }, [cardsByDay]);

  const cardHeight = isMonth ? 18 : 24;
  const cardGap = 2;
  const stripPadding = 6;
  const stripHeight = maxStack > 0
    ? stripPadding * 2 + maxStack * cardHeight + (maxStack - 1) * cardGap
    : 36;

  return (
    <div className="flex border-b border-slate-200 bg-gradient-to-r from-red-50/30 via-rose-50/20 to-white">
      {/* Label column */}
      <div className="w-[176px] shrink-0 border-r-2 border-slate-200 px-5 flex items-center bg-red-50/40">
        <div className="flex items-center gap-1.5">
          <Flag className="h-3 w-3 text-red-400" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-red-400">Deadlines</span>
        </div>
      </div>

      {/* Cards area */}
      <div className="relative flex-1" style={{ height: stripHeight }}>
        {/* Background grid columns */}
        <div className="flex h-full absolute inset-0">
          {days.map((day, i) => {
            const isMonday = day.getDay() === 1;
            const hasDeadline = cards.some((c) => c.dayOffset === i);
            return (
              <div
                key={day.toISOString()}
                className={`h-full
                  ${isMonday && i > 0 ? "border-l border-slate-200/80" : "border-l border-slate-100/70"}
                  ${isWeekend(day) ? "bg-slate-50/40" : ""}
                  ${hasDeadline ? "bg-red-50/20" : ""}
                `}
                style={{ width: dayWidth, minWidth: dayWidth }}
              />
            );
          })}
        </div>

        {/* Deadline cards — positioned absolutely within each day column */}
        {cards.map((card, cardIndex) => {
          // Find stack index within this day
          const dayCards = cardsByDay.get(card.dayOffset) ?? [];
          const stackIndex = dayCards.indexOf(card);
          const top = stripPadding + stackIndex * (cardHeight + cardGap);
          const left = card.dayOffset * dayWidth;

          // Card width = dayWidth with small padding
          const cardWidth = Math.max(dayWidth - 4, 32);

          return (
            <Tooltip key={card.id}>
              <TooltipTrigger asChild>
                <div
                  className={`absolute rounded cursor-default transition-all duration-100 hover:shadow-md hover:z-20
                    border bg-red-50/80 border-red-200/80 hover:border-red-300
                    flex items-center overflow-hidden
                    ${isMonth ? "px-1" : "px-2"}
                  `}
                  style={{
                    top,
                    left: left + 2,
                    width: cardWidth,
                    height: cardHeight,
                  }}
                >
                  <span className={`${isMonth ? "text-[7px]" : "text-[9px]"} font-bold text-red-700/80 truncate leading-none`}>
                    {card.po_number}
                  </span>
                  {!isMonth && dayWidth >= 80 && (
                    <span className="text-[8px] text-red-500/60 truncate ml-1 leading-none">
                      {card.buyer}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] p-3">
                <div className="space-y-1.5">
                  <p className="text-[12px] font-bold text-foreground">{card.po_number}</p>
                  <p className="text-[11px] text-muted-foreground">{card.buyer} · {card.style}</p>
                  <div className="h-px bg-border my-1" />
                  <p className="text-[11px] text-foreground">
                    Ex-Factory: {format(parseISO(card.date), "d MMM yyyy")}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {card.order_qty.toLocaleString()} pcs
                  </p>
                  {card.isPast ? (
                    <p className="text-[10px] font-semibold text-red-600">{Math.abs(card.daysFromNow)}d overdue</p>
                  ) : (
                    <p className={`text-[10px] font-semibold ${card.isUrgent ? "text-amber-600" : "text-slate-500"}`}>
                      {card.daysFromNow}d remaining
                    </p>
                  )}
                  {!card.isScheduled && (
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span className="text-[9px] font-semibold text-amber-600">Not yet scheduled</span>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
