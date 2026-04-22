import { useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  isSameDay, addMonths, subMonths, isWithinInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Props {
  anchorDate: Date;
  visibleRange: { start: Date; end: Date };
  onDateClick: (date: Date) => void;
}

export function MiniCalendar({ anchorDate, visibleRange, onDateClick }: Props) {
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(anchorDate));

  // Recalculate grid when displayMonth changes
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [displayMonth]);

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => subMonths(d, 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-bold text-slate-700 tracking-tight">
          {format(displayMonth, "MMMM yyyy")}
        </span>
        <button
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setDisplayMonth((d) => addMonths(d, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="h-5 flex items-center justify-center">
            <span className="text-[9px] font-semibold text-slate-400 uppercase">{d}</span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, displayMonth);
          const today = isToday(day);
          const inVisibleRange = isWithinInterval(day, { start: visibleRange.start, end: visibleRange.end });
          const isAnchor = isSameDay(day, anchorDate);

          return (
            <button
              key={day.toISOString()}
              className={`h-7 w-full flex items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-all duration-100
                ${!inMonth ? "text-slate-300" : "text-slate-600 hover:bg-slate-100"}
                ${today ? "font-bold text-blue-600" : ""}
                ${inVisibleRange && inMonth ? "bg-blue-50 text-blue-700" : ""}
                ${isAnchor ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
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
