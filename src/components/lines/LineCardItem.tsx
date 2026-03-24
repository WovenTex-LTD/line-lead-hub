import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import type { LinePerformanceData, DataState } from "./types";

interface LineCardItemProps {
  line: LinePerformanceData;
  onClick: () => void;
}

function getAchievementColor(pct: number) {
  if (pct >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getBarColor(pct: number) {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function getPerformanceBadge(pct: number) {
  if (pct >= 100) return { label: "Exceeding", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0" };
  if (pct >= 90) return { label: "On Track", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0" };
  if (pct >= 70) return { label: "Behind", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-0" };
  return { label: "Critical", className: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-0" };
}

function getStateBadge(dataState: DataState, achievementPct: number): { label: string; className: string } {
  switch (dataState) {
    case "eod-submitted":
      return getPerformanceBadge(achievementPct);
    case "awaiting-eod":
      return { label: "Awaiting EOD", className: "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-0" };
    case "output-only":
      return { label: "Output only", className: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-0" };
    case "no-target":
      return { label: "No target set", className: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-0" };
  }
}

export function LineCardItem({ line, onClick }: LineCardItemProps) {
  const { dataState } = line;

  // No target and no output — minimal card
  if (dataState === "no-target") {
    return (
      <Card
        className="cursor-pointer hover:shadow-md transition-all opacity-60"
        onClick={onClick}
      >
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-base font-semibold truncate">{line.name || line.lineId}</span>
              <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                {[line.unitName, line.floorName].filter(Boolean).join(" · ")}
              </span>
            </div>
            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-0 shrink-0">
              No target set
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const badge = getStateBadge(dataState, line.achievementPct);

  // Only show performance metrics (achievement, variance, progress bar) once EOD is submitted
  const showMetrics = dataState === "eod-submitted";
  const variancePositive = line.variance >= 0;

  // Grid columns: 4 when full metrics, 2 for target+output (awaiting-eod), 1 for output-only
  const gridCols =
    showMetrics ? "grid-cols-2 sm:grid-cols-4" :
    dataState === "output-only" ? "grid-cols-1" :
    "grid-cols-2";

  const accentColor = showMetrics
    ? line.achievementPct >= 90 ? "from-emerald-500 to-green-500"
      : line.achievementPct >= 70 ? "from-amber-500 to-orange-500"
      : "from-red-500 to-rose-500"
    : dataState === "awaiting-eod" ? "from-blue-500 to-indigo-500"
    : "from-gray-400 to-gray-500";

  return (
    <Card
      className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-300 group relative overflow-hidden border-t-2"
      style={{ borderTopColor: showMetrics ? (line.achievementPct >= 90 ? '#10b981' : line.achievementPct >= 70 ? '#f59e0b' : '#ef4444') : dataState === 'awaiting-eod' ? '#3b82f6' : '#9ca3af' }}
      onClick={onClick}
    >

      <CardContent className="py-4 px-5 pl-5">
        {/* Top row: name, location, state badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base font-bold truncate">{line.name || line.lineId}</span>
            <span className="text-sm text-muted-foreground truncate hidden sm:inline">
              {[line.unitName, line.floorName].filter(Boolean).join(" · ")}
            </span>
            {line.anomaly === "no-output" && (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={badge.className}>{badge.label}</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Main metrics grid */}
        <div className={cn("grid gap-x-4 gap-y-2 mb-3", gridCols)}>
          {/* Target — hidden for output-only (no target was set) */}
          {dataState !== "output-only" && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Target</p>
              <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                {line.totalTarget > 0 ? line.totalTarget.toLocaleString() : "—"}
              </p>
            </div>
          )}

          {/* Output — "—" until EOD is submitted (awaiting-eod) */}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Output</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {dataState === "awaiting-eod" ? "—" : line.totalOutput.toLocaleString()}
            </p>
          </div>

          {/* Achievement — only when EOD is submitted */}
          {showMetrics && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Achievement</p>
              <p className={cn("text-xl sm:text-2xl font-bold font-mono tabular-nums", getAchievementColor(line.achievementPct))}>
                {line.achievementPct}%
              </p>
            </div>
          )}

          {/* Variance — only when EOD is submitted; never show negative variance without actual data */}
          {showMetrics && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Variance</p>
              <div className="flex items-center gap-1">
                {variancePositive ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <p className={cn(
                  "text-lg sm:text-xl font-bold font-mono tabular-nums",
                  variancePositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {variancePositive ? "+" : ""}{line.variance.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar — only when EOD is submitted */}
        {showMetrics && (
          <div className="h-2 w-full rounded-full bg-muted/80 overflow-hidden mb-2">
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", getBarColor(line.achievementPct))}
              style={{ width: `${Math.min(line.achievementPct, 100)}%` }}
            />
          </div>
        )}

        {/* Bottom row: secondary info */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          {line.poBreakdown.length > 0 && (
            <span>{line.poBreakdown.length} PO{line.poBreakdown.length !== 1 ? "s" : ""}</span>
          )}
          {line.avgManpower > 0 && (
            <span>Manpower: <strong className="text-foreground">{line.avgManpower}</strong></span>
          )}
          {line.totalBlockers > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {line.totalBlockers} blocker{line.totalBlockers !== 1 ? "s" : ""}
            </span>
          )}
          {dataState === "awaiting-eod" && (
            <span className="text-blue-500 dark:text-blue-400 italic">End-of-day output not submitted yet.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
