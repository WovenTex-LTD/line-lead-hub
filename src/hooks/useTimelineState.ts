import { useState, useMemo, useCallback } from "react";
import { addDays, subDays, startOfDay } from "date-fns";

export type ViewMode = "week" | "month";

// Continuous timeline: shows a wide date range, scrollable horizontally.
// "week" and "month" control zoom level (column width), not which dates are visible.
const DAYS_BEFORE = 14;  // days before today to include
const DAYS_AFTER = 90;   // days after today to include

export function useTimelineState() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));

  // The visible range is always a wide continuous window
  const visibleRange = useMemo(() => ({
    start: subDays(anchorDate, DAYS_BEFORE),
    end: addDays(anchorDate, DAYS_AFTER),
  }), [anchorDate]);

  // Scroll-to-day offset: how many days from range start to anchor (today)
  const todayOffset = DAYS_BEFORE;

  const navigateForward = useCallback(() => {
    setAnchorDate((d) => addDays(d, viewMode === "week" ? 7 : 30));
  }, [viewMode]);

  const navigateBack = useCallback(() => {
    setAnchorDate((d) => subDays(d, viewMode === "week" ? 7 : 30));
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
    todayOffset,
    navigateForward,
    navigateBack,
    jumpToToday,
    goToDate,
  };
}
