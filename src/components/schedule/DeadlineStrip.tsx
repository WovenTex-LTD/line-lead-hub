import { useMemo } from "react";
import { eachDayOfInterval, format, parseISO, differenceInDays, isWeekend } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

  const cards: DeadlineCard[] = useMemo(() => {
    const result: DeadlineCard[] = [];
    for (const d of deadlines) {
      const date = parseISO(d.date);
      if (date < visibleRange.start || date > visibleRange.end) continue;
      const dayOffset = differenceInDays(date, visibleRange.start);
      const daysFromNow = differenceInDays(date, new Date());
      for (const wo of d.workOrders) {
        result.push({ ...wo, date: d.date, dayOffset, daysFromNow, isPast: daysFromNow < 0, isUrgent: daysFromNow >= 0 && daysFromNow <= 14 });
      }
    }
    return result;
  }, [deadlines, visibleRange]);

  const cardsByDay = useMemo(() => {
    const map = new Map<number, DeadlineCard[]>();
    for (const card of cards) {
      const list = map.get(card.dayOffset) ?? [];
      list.push(card);
      map.set(card.dayOffset, list);
    }
    return map;
  }, [cards]);

  const maxStack = useMemo(() => {
    let max = 0;
    for (const list of cardsByDay.values()) if (list.length > max) max = list.length;
    return max;
  }, [cardsByDay]);

  if (cards.length === 0) return null;

  const cardH = isMonth ? 16 : 20;
  const gap = 2;
  const pad = 4;
  const stripH = pad * 2 + maxStack * cardH + Math.max(0, maxStack - 1) * gap;

  return (
    <div className="flex border-b border-slate-100">
      {/* Label */}
      <div className="w-[168px] shrink-0 border-r border-slate-200 px-4 flex items-center bg-red-50/30">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-red-400/80">Deadlines</span>
        </div>
      </div>

      {/* Cards area */}
      <div className="relative flex-1 bg-red-50/[0.08]" style={{ height: stripH }}>
        {/* Grid alignment */}
        <div className="flex h-full absolute inset-0">
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className={`h-full
                ${day.getDay() === 1 && i > 0 ? "border-l border-slate-200/40" : i > 0 ? "border-l border-slate-100/40" : ""}
                ${isWeekend(day) ? "bg-slate-50/20" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            />
          ))}
        </div>

        {/* Deadline cards */}
        {cards.map((card) => {
          const dayCards = cardsByDay.get(card.dayOffset) ?? [];
          const stackIdx = dayCards.indexOf(card);
          const top = pad + stackIdx * (cardH + gap);
          return (
            <Tooltip key={card.id}>
              <TooltipTrigger asChild>
                <div
                  className={`absolute rounded border flex items-center whitespace-nowrap px-1.5 cursor-default transition-all duration-100
                    ${card.isPast
                      ? "border-red-300/80 bg-red-100/90 hover:bg-red-200/80"
                      : "border-red-200/60 bg-red-50/90 hover:bg-red-100/70"
                    }
                    hover:z-20 hover:shadow-sm
                  `}
                  style={{ top, left: card.dayOffset * dayWidth + 2, height: cardH }}
                >
                  <span className={`${isMonth ? "text-[7px]" : "text-[9px]"} font-semibold ${card.isPast ? "text-red-700" : "text-red-500/80"}`}>
                    {card.po_number}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] p-2.5">
                <p className="text-[12px] font-bold">{card.po_number}</p>
                <p className="text-[10px] text-muted-foreground">{card.buyer} · {card.style}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Ex: {format(parseISO(card.date), "d MMM yyyy")} · {card.order_qty.toLocaleString()} pcs</p>
                {card.isPast && <p className="text-[10px] font-semibold text-red-600 mt-1">{Math.abs(card.daysFromNow)}d overdue</p>}
                {!card.isPast && card.isUrgent && <p className="text-[10px] font-semibold text-amber-600 mt-1">{card.daysFromNow}d remaining</p>}
                {!card.isScheduled && <p className="text-[9px] font-medium text-amber-600 mt-0.5">Not yet scheduled</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
