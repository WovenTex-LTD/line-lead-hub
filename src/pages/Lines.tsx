import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Rows3, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { useLinePerformance } from "@/components/lines/useLinePerformance";
import { LinePerformanceControls } from "@/components/lines/LinePerformanceControls";
import { LinePerformanceSummary } from "@/components/lines/LinePerformanceSummary";
import { LinePerformanceCards } from "@/components/lines/LinePerformanceCards";
import { LineDrilldownDrawer } from "@/components/lines/LineDrilldownDrawer";
import { LineExportButton } from "@/components/lines/LineExportButton";

export default function Lines() {
  const navigate = useNavigate();
  const {
    loading,
    selectedDate,
    setSelectedDate,
    timeRange,
    setTimeRange,
    filters,
    setFilters,
    filteredLines,
    trendData,
    units,
    floors,
    factorySummary,
    dateRange,
  } = useLinePerformance();

  const [drawerLineId, setDrawerLineId] = useState<string | null>(null);

  const drawerLine = useMemo(
    () => (drawerLineId ? filteredLines.find((l) => l.id === drawerLineId) ?? null : null),
    [drawerLineId, filteredLines]
  );

  const drawerTrend = useMemo(
    () => (drawerLineId ? trendData.get(drawerLineId) ?? null : null),
    [drawerLineId, trendData]
  );

  const dateLabel = useMemo(() => {
    if (timeRange === "daily") return format(selectedDate, "MMM d, yyyy");
    return `Last ${timeRange} days`;
  }, [timeRange, selectedDate]);

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Rows3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold">Lines</h1>
              <span className="text-xs font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5">
                {filteredLines.length} lines
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Track sewing line output, targets, and PO contribution
            </p>
          </div>
        </div>
        <LineExportButton lines={filteredLines} timeRange={timeRange} dateLabel={dateLabel} />
      </div>

      {/* Controls bar */}
      <LinePerformanceControls
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        filters={filters}
        onFiltersChange={setFilters}
        units={units}
        floors={floors}
        onScheduleClick={() => navigate("/schedule")}
      />

      {/* Summary KPIs */}
      <LinePerformanceSummary
        summary={factorySummary}
        activeLineCount={filteredLines.length}
      />

      {/* Line rows */}
      <LinePerformanceCards
        lines={filteredLines}
        loading={loading}
        timeRange={timeRange}
        onLineClick={(id) => setDrawerLineId(id)}
      />

      {/* Drilldown dialog */}
      <LineDrilldownDrawer
        line={drawerLine}
        trendData={drawerTrend}
        timeRange={timeRange}
        dateLabel={dateLabel}
        dateRange={dateRange}
        open={!!drawerLineId}
        onClose={() => setDrawerLineId(null)}
      />
    </div>
  );
}
