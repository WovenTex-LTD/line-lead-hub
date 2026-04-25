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
      <div className="flex items-center justify-between mb-1.5">
        <button
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => subMonths(d, 1))}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="text-[11px] font-bold text-slate-800 tracking-tight">
          {format(displayMonth, "MMM yyyy")}
        </span>
        <button
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => addMonths(d, 1))}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="h-5 flex items-center justify-center">
            <span className={`text-[9px] font-semibold ${i >= 5 ? "text-slate-300" : "text-slate-400"}`}>{d}</span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, displayMonth);
          const today = isToday(day);
          const weekend = isWeekend(day);
          const inRange = inMonth && isWithinInterval(day, { start: visibleRange.start, end: visibleRange.end });
          const isAnchor = isSameDay(day, anchorDate);

          return (
            <button
              key={day.toISOString()}
              className={`h-6 w-full flex items-center justify-center text-[10px] tabular-nums transition-all duration-75
                ${!inMonth ? "text-slate-200" : weekend ? "text-slate-400" : "text-slate-600"}
                ${inMonth && !inRange && !isAnchor && !today ? "hover:bg-slate-50 rounded" : ""}
                ${inRange && !isAnchor && !today ? "bg-blue-50 text-blue-700 font-medium" : ""}
                ${today && !isAnchor ? "font-bold text-blue-600 bg-blue-100/60 rounded" : ""}
                ${isAnchor ? "bg-blue-600 text-white font-bold rounded shadow-sm" : ""}
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
