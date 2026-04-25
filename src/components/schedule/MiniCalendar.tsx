import { useEffect, useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  isSameDay, addMonths, subMonths, isWithinInterval, isWeekend,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  anchorDate: Date;
  visibleRange: { start: Date; end: Date };
  onDateClick: (date: Date) => void;
}

export function MiniCalendar({ anchorDate, visibleRange, onDateClick }: Props) {
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(anchorDate));

  // Sync mini calendar when planner navigates to a different month
  useEffect(() => {
    const anchorMonth = startOfMonth(anchorDate);
    if (anchorMonth.getTime() !== displayMonth.getTime()) {
      setDisplayMonth(anchorMonth);
    }
  }, [anchorDate]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [displayMonth]);

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => subMonths(d, 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[12px] font-bold text-slate-800 tracking-tight">
          {format(displayMonth, "MMMM yyyy")}
        </span>
        <button
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => addMonths(d, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, i) => (
          <div key={i} className="h-7 flex items-center justify-center">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${i >= 5 ? "text-slate-300" : "text-slate-400"}`}>{d}</span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-px">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, displayMonth);
          const today = isToday(day);
          const weekend = isWeekend(day);
          const inRange = inMonth && isWithinInterval(day, { start: visibleRange.start, end: visibleRange.end });
          const isAnchor = isSameDay(day, anchorDate);

          return (
            <button
              key={day.toISOString()}
              className={`h-7 w-full flex items-center justify-center text-[11px] tabular-nums transition-all duration-100
                ${!inMonth ? "text-slate-200" : weekend ? "text-slate-400" : "text-slate-600"}
                ${inMonth && !inRange && !isAnchor && !today ? "hover:bg-slate-50 rounded-md" : ""}
                ${inRange && !isAnchor && !today ? "bg-blue-50 text-blue-700 font-medium first:rounded-l-md last:rounded-r-md" : ""}
                ${today && !isAnchor ? "font-bold text-blue-600 bg-blue-100/60 rounded-md" : ""}
                ${isAnchor ? "bg-blue-600 text-white font-bold rounded-md shadow-sm" : ""}
              `}
              onClick={() => onDateClick(day)}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
