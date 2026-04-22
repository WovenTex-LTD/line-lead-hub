import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, Minimize2, AlignJustify, Maximize2 } from "lucide-react";
import { format } from "date-fns";
import type { ViewMode } from "@/hooks/useTimelineState";
import type { FactoryLine } from "@/hooks/useProductionSchedule";
import type { RowSize } from "@/pages/Schedule";

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onJumpToToday: () => void;
  visibleRange: { start: Date; end: Date };
  lines: FactoryLine[];
  buyers: string[];
  selectedLine: string;
  onLineChange: (value: string) => void;
  selectedBuyer: string;
  onBuyerChange: (value: string) => void;
  riskOnly: boolean;
  onRiskOnlyChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  rowSize: RowSize;
  onRowSizeChange: (size: RowSize) => void;
}

export function ScheduleControls({
  viewMode, onViewModeChange, onNavigateBack, onNavigateForward, onJumpToToday,
  visibleRange, lines, buyers, selectedLine, onLineChange, selectedBuyer, onBuyerChange,
  riskOnly, onRiskOnlyChange, search, onSearchChange, rowSize, onRowSizeChange,
}: Props) {
  const rangeLabel = viewMode === "week"
    ? `${format(visibleRange.start, "d MMM")} – ${format(visibleRange.end, "d MMM yyyy")}`
    : format(visibleRange.start, "MMMM yyyy");

  const cycleRowSize = () => {
    const order: RowSize[] = ["compact", "default", "expanded"];
    onRowSizeChange(order[(order.indexOf(rowSize) + 1) % 3]);
  };

  const RowIcon = rowSize === "compact" ? Minimize2 : rowSize === "expanded" ? Maximize2 : AlignJustify;

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      {/* Left: navigation */}
      <div className="flex items-center gap-1">
        {/* View toggle */}
        <div className="inline-flex rounded-lg bg-slate-100 p-[3px]">
          <button
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-150
              ${viewMode === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}
            `}
            onClick={() => onViewModeChange("week")}
          >
            Week
          </button>
          <button
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-150
              ${viewMode === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}
            `}
            onClick={() => onViewModeChange("month")}
          >
            Month
          </button>
        </div>

        {/* Date navigation */}
        <div className="flex items-center ml-2">
          <button className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" onClick={onNavigateBack}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-semibold text-slate-800 min-w-[160px] text-center tabular-nums tracking-tight">
            {rangeLabel}
          </span>
          <button className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" onClick={onNavigateForward}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Today + density */}
        <button
          className="ml-1 h-8 px-3 text-[12px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          onClick={onJumpToToday}
        >
          Today
        </button>

        <button
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          onClick={cycleRowSize}
          title={`Row size: ${rowSize}`}
        >
          <RowIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: filters */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
          <Input
            placeholder="Search PO..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-[140px] pl-8 text-[12px] bg-slate-50 border-slate-200/60 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-slate-300"
          />
        </div>

        <Select value={selectedLine} onValueChange={onLineChange}>
          <SelectTrigger className="h-8 w-[110px] text-[12px] bg-slate-50 border-slate-200/60">
            <SelectValue placeholder="All Lines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lines</SelectItem>
            {lines.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.line_id}{l.name ? ` — ${l.name}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedBuyer} onValueChange={onBuyerChange}>
          <SelectTrigger className="h-8 w-[110px] text-[12px] bg-slate-50 border-slate-200/60">
            <SelectValue placeholder="All Buyers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buyers</SelectItem>
            {buyers.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          className={`h-8 px-3 text-[12px] font-medium rounded-lg transition-all duration-150
            ${riskOnly
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }
          `}
          aria-pressed={riskOnly}
          onClick={() => onRiskOnlyChange(!riskOnly)}
        >
          At risk
        </button>
      </div>
    </div>
  );
}
