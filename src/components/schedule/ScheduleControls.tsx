import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarDays, Search, Minimize2, Maximize2, AlignJustify } from "lucide-react";
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
  anchorDate: Date;
  visibleMonthLabel: string;
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

const rowSizeConfig: { value: RowSize; icon: typeof Minimize2; label: string }[] = [
  { value: "compact", icon: Minimize2, label: "Compact rows" },
  { value: "default", icon: AlignJustify, label: "Default rows" },
  { value: "expanded", icon: Maximize2, label: "Expanded rows" },
];

export function ScheduleControls({
  viewMode, onViewModeChange, onNavigateBack, onNavigateForward, onJumpToToday,
  visibleRange, anchorDate, visibleMonthLabel, lines, buyers, selectedLine, onLineChange, selectedBuyer, onBuyerChange,
  riskOnly, onRiskOnlyChange, search, onSearchChange, rowSize, onRowSizeChange,
}: Props) {
  const rangeLabel = visibleMonthLabel || format(anchorDate, "MMMM yyyy");

  const cycleRowSize = () => {
    const order: RowSize[] = ["compact", "default", "expanded"];
    onRowSizeChange(order[(order.indexOf(rowSize) + 1) % 3]);
  };

  const RowIcon = rowSizeConfig.find((c) => c.value === rowSize)!.icon;

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
      {/* Left: View toggle + Navigation */}
      <div className="flex items-center gap-1">
        <div className="inline-flex rounded-lg bg-slate-100 p-[3px]">
          <button
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150
              ${viewMode === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}
            `}
            onClick={() => onViewModeChange("week")}
          >
            Week
          </button>
          <button
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150
              ${viewMode === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}
            `}
            onClick={() => onViewModeChange("month")}
          >
            Month
          </button>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={onNavigateBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-[13px] font-bold text-slate-800 min-w-[170px] text-center tabular-nums tracking-tight">{rangeLabel}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={onNavigateForward}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[11px] font-medium text-slate-500 hover:text-slate-800" onClick={onJumpToToday}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Today
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-slate-700"
          onClick={cycleRowSize}
          title={rowSizeConfig.find((c) => c.value === rowSize)!.label}
        >
          <RowIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Right: Filters */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
          <Input
            placeholder="Search PO..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-[140px] pl-8 text-[11px] bg-slate-50 border-slate-200/60 focus-visible:bg-white"
          />
        </div>

        <Select value={selectedLine} onValueChange={onLineChange}>
          <SelectTrigger className="h-8 w-[110px] text-[11px] bg-slate-50 border-slate-200/60">
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
          <SelectTrigger className="h-8 w-[110px] text-[11px] bg-slate-50 border-slate-200/60">
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
          className={`h-8 px-3 text-[11px] font-semibold rounded-lg transition-all duration-150
            ${riskOnly
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }
          `}
          aria-pressed={riskOnly}
          onClick={() => onRiskOnlyChange(!riskOnly)}
        >
          Risks Only
        </button>
      </div>
    </div>
  );
}
