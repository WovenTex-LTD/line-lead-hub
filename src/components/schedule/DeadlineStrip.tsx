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

  if (cards.length === 0) return null;

  const MAX_VISIBLE = 2;
  const tagH = isMonth ? 16 : 18;
  const gap = 2;
  const pad = 4;
  const visibleStack = Math.min(MAX_VISIBLE, (() => { let m = 0; for (const l of cardsByDay.values()) if (l.length > m) m = l.length; return m; })());
  const stripH = pad * 2 + visibleStack * tagH + Math.max(0, visibleStack - 1) * gap;

  return (
    <div className="flex border-b border-slate-100">
      {/* Label — matches line row treatment */}
      <div className="w-[148px] shrink-0 border-r border-slate-200 border-l-[3px] border-l-red-400/60 px-4 flex items-center bg-slate-50 sticky left-0 z-20">
        <span className="text-[12px] font-semibold text-slate-700 tracking-tight">Ex-Factory</span>
      </div>

      {/* Tags area */}
      <div className="relative flex-1" style={{ height: stripH }}>
        {/* Grid alignment */}
        <div className="flex h-full absolute inset-0">
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className={`h-full
                ${day.getDay() === 1 && i > 0 ? "border-l border-slate-200/40" : i > 0 ? "border-l border-slate-100/40" : ""}
                ${isWeekend(day) ? "bg-slate-50/30" : ""}
              `}
              style={{ width: dayWidth, minWidth: dayWidth }}
            />
          ))}
        </div>

        {/* Deadline tags — max 2 visible per column, overflow becomes "+N" badge */}
        {Array.from(cardsByDay.entries()).flatMap(([dayOffset, dayCards]) => {
          const tagWidth = dayWidth - 6;
          const leftPos = dayOffset * dayWidth + 3;
          const overflow = dayCards.length - MAX_VISIBLE + 1;
          const showOverflow = dayCards.length > MAX_VISIBLE;

          const visibleCards = showOverflow ? dayCards.slice(0, MAX_VISIBLE - 1) : dayCards;

          return [
            ...visibleCards.map((card, stackIdx) => (
              <Tooltip key={card.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute flex items-center justify-center cursor-default transition-all duration-100 rounded
                      ${card.isPast
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : card.isUrgent
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "bg-emerald-500 text-white hover:bg-emerald-600"
                      }
                      hover:z-20
                    `}
                    style={{ top: pad + stackIdx * (tagH + gap), left: leftPos, width: tagWidth, height: tagH }}
                  >
                    <span className={`${isMonth ? "text-[8px]" : "text-[9px]"} font-semibold leading-none`}>
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
            )),
            ...(showOverflow ? [
              <Tooltip key={`overflow-${dayOffset}`}>
                <TooltipTrigger asChild>
                  <div
                    className="absolute flex items-center justify-center cursor-default rounded bg-slate-200 text-slate-600 hover:bg-slate-300 hover:z-20 transition-colors"
                    style={{ top: pad + (MAX_VISIBLE - 1) * (tagH + gap), left: leftPos, width: tagWidth, height: tagH }}
                  >
                    <span className={`${isMonth ? "text-[8px]" : "text-[9px]"} font-semibold leading-none`}>+{overflow} more</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] p-2.5">
                  <p className="text-[11px] font-bold mb-1.5">Ex-Factory: {format(parseISO(dayCards[0].date), "d MMM yyyy")}</p>
                  {dayCards.map(c => (
                    <p key={c.id} className="text-[10px] text-muted-foreground">{c.po_number} — {c.buyer}</p>
                  ))}
                </TooltipContent>
              </Tooltip>
            ] : []),
          ];
        })}
      </div>
    </div>
  );
}
