import { subDays, format } from "date-fns";
import { Calendar as CalendarIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TimeRange, LineFilters } from "./types";

interface LinePerformanceControlsProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  filters: LineFilters;
  onFiltersChange: (filters: LineFilters) => void;
  units: { id: string; name: string }[];
  floors: { id: string; name: string }[];
}

const RANGE_LABELS: Record<TimeRange, string> = {
  daily: "Daily",
  "7": "Last 7 days",
  "14": "Last 14 days",
  "21": "Last 21 days",
  "30": "Last 30 days",
};

export function LinePerformanceControls({
  selectedDate,
  onDateChange,
  timeRange,
  onTimeRangeChange,
  filters,
  onFiltersChange,
  units,
  floors,
}: LinePerformanceControlsProps) {
  const today = new Date();
  const thirtyDaysAgo = subDays(today, 30);
  const isDaily = timeRange === "daily";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Left group: date + range */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date picker — only enabled in daily mode */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!isDaily}
              className={cn(!isDaily && "opacity-50")}
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {format(selectedDate, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && onDateChange(date)}
              disabled={{ before: thirtyDaysAgo, after: today }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Range select */}
        <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="21">Last 21 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>

        {/* Unit filter */}
        {units.length > 1 && (
          <Select
            value={filters.unitFilter || "all"}
            onValueChange={(v) => onFiltersChange({ ...filters, unitFilter: v === "all" ? null : v })}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All Units" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Floor filter */}
        {floors.length > 1 && (
          <Select
            value={filters.floorFilter || "all"}
            onValueChange={(v) => onFiltersChange({ ...filters, floorFilter: v === "all" ? null : v })}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All Floors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Floors</SelectItem>
              {floors.map((f) => (
                <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}


      </div>

      {/* Right: search */}
      <div className="relative sm:ml-auto max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by line, unit, or floor..."
          value={filters.searchTerm}
          onChange={(e) => onFiltersChange({ ...filters, searchTerm: e.target.value })}
          className="pl-9"
        />
      </div>
    </div>
  );
}
