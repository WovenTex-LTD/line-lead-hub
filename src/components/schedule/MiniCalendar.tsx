import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  isSameDay, addMonths, subMonths, isWithinInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  anchorDate: Date;
  visibleRange: { start: Date; end: Date };
  onDateClick: (date: Date) => void;
}

export function MiniCalendar({ anchorDate, visibleRange, onDateClick }: Props) {
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(anchorDate));

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
      <div className="flex items-center justify-between mb-3">
        <button
          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => subMonths(d, 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[12px] font-bold text-slate-800">
          {format(displayMonth, "MMMM yyyy")}
        </span>
        <button
          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => addMonths(d, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, i) => (
          <div key={i} className="h-6 flex items-center justify-center">
            <span className={`text-[10px] font-semibold ${i >= 5 ? "text-slate-300" : "text-slate-400"}`}>{d}</span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, displayMonth);
          const today = isToday(day);
          const inRange = isWithinInterval(day, { start: visibleRange.start, end: visibleRange.end });
          const isAnchor = isSameDay(day, anchorDate);

          return (
            <button
              key={day.toISOString()}
              className={`h-8 w-full flex items-center justify-center rounded-full text-[11px] tabular-nums transition-all duration-75
                ${!inMonth ? "text-slate-250 hover:text-slate-400" : "text-slate-600 hover:bg-slate-100"}
                ${inRange && inMonth && !isAnchor && !today ? "bg-blue-50/80 text-blue-700 font-medium" : ""}
                ${today && !isAnchor ? "font-bold text-blue-600 ring-1 ring-blue-200" : ""}
                ${isAnchor ? "bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm" : ""}
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
