import { useState, useMemo, useCallback } from "react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, startOfDay } from "date-fns";

export type ViewMode = "week" | "month";

export function useTimelineState() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));

  const visibleRange = useMemo(() => {
    if (viewMode === "week") {
      return {
        start: startOfWeek(anchorDate, { weekStartsOn: 1 }),
        end: endOfWeek(anchorDate, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfMonth(anchorDate),
      end: endOfMonth(anchorDate),
    };
  }, [viewMode, anchorDate]);

  const navigateForward = useCallback(() => {
    setAnchorDate((d) => (viewMode === "week" ? addWeeks(d, 1) : addMonths(d, 1)));
  }, [viewMode]);

  const navigateBack = useCallback(() => {
    setAnchorDate((d) => (viewMode === "week" ? subWeeks(d, 1) : subMonths(d, 1)));
  }, [viewMode]);

  const jumpToToday = useCallback(() => {
    setAnchorDate(startOfDay(new Date()));
  }, []);

  const goToDate = useCallback((date: Date) => {
    setAnchorDate(startOfDay(date));
  }, []);

  return {
    viewMode,
    setViewMode,
    anchorDate,
    visibleRange,
    navigateForward,
    navigateBack,
    jumpToToday,
    goToDate,
  };
}
