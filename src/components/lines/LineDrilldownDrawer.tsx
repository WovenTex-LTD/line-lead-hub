import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Users, AlertTriangle, Clock } from "lucide-react";
import { SewingSubmissionView } from "@/components/SewingSubmissionView";
import type { SewingTargetData, SewingActualData } from "@/components/SewingSubmissionView";
import { LinePOTable } from "./LinePOTable";
import { LineDrilldownTrend } from "./LineDrilldownTrend";
import { useLineSubmissions } from "./useLineSubmissions";
import type { LinePerformanceData, LineTrendData, TimeRange } from "./types";

interface LineDrilldownDrawerProps {
  line: LinePerformanceData | null;
  trendData: LineTrendData | null;
  timeRange: TimeRange;
  dateLabel: string;
  dateRange: { start: string; end: string };
  open: boolean;
  onClose: () => void;
}

function getAchievementColor(pct: number) {
  if (pct >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function LineDrilldownDrawer({
  line,
  trendData,
  timeRange,
  dateLabel,
  dateRange,
  open,
  onClose,
}: LineDrilldownDrawerProps) {
  // Submission data for clickable PO rows
  const {
    loading: submissionsLoading,
    getDateEntries,
    getSubmissionData,
    getDailySubmission,
  } = useLineSubmissions(open && line ? line.id : null, dateRange);

  // Submission view modal state
  const [submissionTarget, setSubmissionTarget] = useState<SewingTargetData | null>(null);
  const [submissionActual, setSubmissionActual] = useState<SewingActualData | null>(null);
  const [submissionOpen, setSubmissionOpen] = useState(false);

  const openSubmission = useCallback(
    (workOrderId: string, date: string) => {
      const { target, actual } = getSubmissionData(workOrderId, date);
      if (!target && !actual) return;
      setSubmissionTarget(target);
      setSubmissionActual(actual);
      setSubmissionOpen(true);
    },
    [getSubmissionData]
  );

  const handlePOClick = useCallback(
    (workOrderId: string, date?: string) => {
      if (timeRange === "daily" || !date) {
        openSubmission(workOrderId, dateRange.start);
      } else {
        openSubmission(workOrderId, date);
      }
    },
    [timeRange, dateRange.start, openSubmission]
  );

  const handleSubmissionClose = useCallback((val: boolean) => {
    setSubmissionOpen(val);
    if (!val) {
      setTimeout(() => {
        setSubmissionTarget(null);
        setSubmissionActual(null);
      }, 200);
    }
  }, []);

  if (!line) return null;

  const hasTarget = line.totalTarget > 0;
  const showTrend = timeRange !== "daily" && trendData && trendData.daily.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
        <DialogContent className="max-w-4xl w-[calc(100%-2rem)]">
          {/* Header */}
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 flex items-center justify-center shrink-0">
                <Target className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {line.name || line.lineId}
                </DialogTitle>
                <DialogDescription>
                  {[line.unitName, line.floorName].filter(Boolean).join(" · ")}
                  {" · "}
                  {dateLabel}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
            <Card className="border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 via-white to-blue-50/50 dark:from-blue-950/40 dark:via-card dark:to-blue-950/20">
              <CardContent className="p-4 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-500/20 flex items-center justify-center">
                    <Target className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Target</p>
                </div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 font-mono tabular-nums">
                  {hasTarget ? line.totalTarget.toLocaleString() : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20">
              <CardContent className="p-4 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-sm shadow-emerald-500/20 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Output</p>
                </div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums">
                  {line.totalOutput.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "bg-gradient-to-br",
              hasTarget && line.achievementPct >= 90
                ? "border-emerald-200/60 dark:border-emerald-800/40 from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20"
                : hasTarget && line.achievementPct >= 70
                ? "border-amber-200/60 dark:border-amber-800/40 from-amber-50 via-white to-amber-50/50 dark:from-amber-950/40 dark:via-card dark:to-amber-950/20"
                : hasTarget
                ? "border-red-200/60 dark:border-red-800/40 from-red-50 via-white to-red-50/50 dark:from-red-950/40 dark:via-card dark:to-red-950/20"
                : ""
            )}>
              <CardContent className="p-4 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br shadow-sm flex items-center justify-center",
                    hasTarget && line.achievementPct >= 90 ? "from-emerald-500 to-green-600 shadow-emerald-500/20"
                    : hasTarget && line.achievementPct >= 70 ? "from-amber-500 to-orange-600 shadow-amber-500/20"
                    : "from-red-500 to-rose-600 shadow-red-500/20"
                  )}>
                    <TrendingUp className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Achievement</p>
                </div>
                <div className={cn(
                  "text-2xl font-bold font-mono tabular-nums",
                  hasTarget ? getAchievementColor(line.achievementPct) : "text-muted-foreground"
                )}>
                  {hasTarget ? `${line.achievementPct}%` : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50 via-white to-violet-50/50 dark:from-violet-950/40 dark:via-card dark:to-violet-950/20">
              <CardContent className="p-4 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm shadow-violet-500/20 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Manpower</p>
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-violet-700 dark:text-violet-300">
                  {line.avgManpower > 0 ? line.avgManpower : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-amber-50/50 dark:from-amber-950/40 dark:via-card dark:to-amber-950/20">
              <CardContent className="p-4 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm shadow-amber-500/20 flex items-center justify-center">
                    <Clock className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">OT Hours</p>
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {line.totalOtHours > 0 ? line.totalOtHours : "—"}
                </div>
                {line.totalOtManpower > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {line.totalOtManpower} workers
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Variance + Blockers */}
          {(hasTarget || line.totalBlockers > 0) && (
            <div className="flex items-center gap-4 text-sm flex-wrap mt-1">
              {hasTarget && (
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                  line.variance >= 0 ? "bg-emerald-100 dark:bg-emerald-500/15" : "bg-red-100 dark:bg-red-500/15"
                )}>
                  <span className="text-muted-foreground text-xs">Variance</span>
                  <strong className={cn(
                    "font-mono text-sm",
                    line.variance >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                  )}>
                    {line.variance >= 0 ? "+" : ""}{line.variance.toLocaleString()}
                  </strong>
                </div>
              )}
              {line.totalBlockers > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/15">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                    {line.totalBlockers} blocker{line.totalBlockers !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* PO Contribution */}
          <Card className="shadow-sm mt-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-500/20 flex items-center justify-center">
                  <Target className="h-3.5 w-3.5 text-white" />
                </div>
                PO Contribution
                <Badge variant="secondary" className="text-[10px]">{line.poBreakdown.length}</Badge>
                <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                  {timeRange === "daily" ? "Click a PO to view submission" : "Click a PO to view daily submissions"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <LinePOTable
                poBreakdown={line.poBreakdown}
                lineTotal={{ target: line.totalTarget, output: line.totalOutput }}
                timeRange={timeRange}
                submissionsLoading={submissionsLoading}
                getDateEntries={getDateEntries}
                onPOClick={handlePOClick}
              />
            </CardContent>
          </Card>

          {/* Trend (range mode only) */}
          {showTrend && (
            <Card className="shadow-sm mt-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-sm shadow-emerald-500/20 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 text-white" />
                  </div>
                  Output Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <LineDrilldownTrend
                  trendData={trendData!}
                  poBreakdown={line.poBreakdown}
                />
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      {/* Submission detail modal — read-only, no edit/delete */}
      <SewingSubmissionView
        target={submissionTarget}
        actual={submissionActual}
        open={submissionOpen}
        onOpenChange={handleSubmissionClose}
      />
    </>
  );
}
