import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TargetVsActualComparison } from "@/components/insights/TargetVsActualComparison";
import {
  Crosshair,
  ClipboardCheck,
  Plus,
  ChevronRight,
  Package,
} from "lucide-react";

/** Minimal shape required from target data */
export interface TargetItem {
  id: string;
  line_uuid: string;
  line_name: string;
  po_number: string | null;
  per_hour_target: number;
  manpower_planned?: number | null;
  m_power_planned?: number | null;
  submitted_at: string | null;
  buyer?: string | null;
  style?: string | null;
}

/** Minimal shape required from end-of-day data */
export interface EodItem {
  id: string;
  line_uuid: string;
  line_name: string;
  po_number: string | null;
  output: number;
  submitted_at: string;
  has_blocker: boolean;
  total_poly?: number;
  total_carton?: number;
  manpower?: number | null;
  buyer?: string | null;
  style?: string | null;
}

export interface LineItem {
  id: string;
  line_id: string;
  name: string | null;
}

interface StageConfig {
  addTargetLink: string;
  addEodLink: string;
  viewAllTargetsLink: string;
  viewAllEodLink: string;
  eodMetricLabel: string;
  targetMetricLabel: string;
  targetIconColor: string;
  targetIconBg: string;
  eodIconColor: string;
  eodIconBg: string;
  /** When true, target values are day totals (not per-hour rates) */
  targetIsDaily: boolean;
  /** Gradient for top accent bar on cards */
  cardAccent: string;
}

const STAGE_CONFIGS: Record<"sewing" | "finishing", StageConfig> = {
  sewing: {
    addTargetLink: "/sewing/morning-targets",
    addEodLink: "/sewing/end-of-day",
    viewAllTargetsLink: "/today?tab=sewing",
    viewAllEodLink: "/today?tab=sewing",
    eodMetricLabel: "output",
    targetMetricLabel: "per hour",
    targetIconColor: "text-white",
    targetIconBg: "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20",
    eodIconColor: "text-white",
    eodIconBg: "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20",
    targetIsDaily: false,
    cardAccent: "from-blue-500 to-indigo-500",
  },
  finishing: {
    addTargetLink: "/finishing/daily-target",
    addEodLink: "/finishing/daily-output",
    viewAllTargetsLink: "/today?tab=finishing",
    viewAllEodLink: "/today?tab=finishing",
    eodMetricLabel: "poly",
    targetMetricLabel: "poly",
    targetIconColor: "text-white",
    targetIconBg: "bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20",
    eodIconColor: "text-white",
    eodIconBg: "bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20",
    targetIsDaily: true,
    cardAccent: "from-violet-500 to-purple-500",
  },
};

/**
 * Shared dashboard layout for Sewing and Finishing tabs.
 *
 * Renders:
 * 1. Two side-by-side cards – "Morning Targets" and "End of Day"
 * 2. A Target vs Actual comparison table
 */
export function StageDashboardSection<
  T extends TargetItem,
  E extends EodItem,
>({
  stage,
  targets,
  endOfDay,
  allLines,
  loading,
  onTargetClick,
  onEodClick,
  formatTime,
  renderTargetMetric,
}: {
  stage: "sewing" | "finishing";
  targets: T[];
  endOfDay: E[];
  allLines: LineItem[];
  loading: boolean;
  onTargetClick: (target: T) => void;
  onEodClick: (eod: E) => void;
  formatTime: (dateString: string) => string;
  /** Optional custom renderer for the target metric area (right side of each target row) */
  renderTargetMetric?: (target: T) => React.ReactNode;
}) {
  const config = STAGE_CONFIGS[stage];
  const isFinishing = stage === "finishing";
  const TargetIcon = isFinishing ? Package : Crosshair;

  const skeletonRows = (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
      ))}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Morning Targets Card */}
        <Card className="relative overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border-t-2" style={{ borderTopColor: isFinishing ? '#8b5cf6' : '#3b82f6' }}>
          <CardHeader className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <div className={`h-7 w-7 rounded-lg ${config.targetIconBg} flex items-center justify-center`}>
                <TargetIcon className={`h-3.5 w-3.5 ${config.targetIconColor}`} />
              </div>
              Morning Targets
            </CardTitle>
            <div className="flex gap-1 sm:gap-2">
              <Link to={config.viewAllTargetsLink}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                >
                  View All
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-0.5 sm:ml-1" />
                </Button>
              </Link>
              <Link to={config.addTargetLink}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                >
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                  Add
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              skeletonRows
            ) : targets.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {targets.map((target) => (
                  <div
                    key={target.id}
                    onClick={() => onTargetClick(target)}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border/50 transition-all duration-200 cursor-pointer group/row"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isFinishing ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-blue-100 dark:bg-blue-500/15'}`}>
                        <TargetIcon className={`h-4 w-4 ${isFinishing ? 'text-violet-600 dark:text-violet-400' : 'text-blue-600 dark:text-blue-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {isFinishing
                              ? (target.po_number || "No PO")
                              : target.line_name}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {isFinishing
                            ? `${[target.buyer, target.style].filter(Boolean).join(" • ") || "No details"} • `
                            : `${[target.buyer, target.po_number].filter(Boolean).join(" • ") || "No PO"} • `}
                          {target.submitted_at
                            ? formatTime(target.submitted_at)
                            : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {renderTargetMetric ? (
                        renderTargetMetric(target)
                      ) : (
                        <>
                          <p className={`font-mono font-bold text-lg ${isFinishing ? 'text-violet-700 dark:text-violet-300' : 'text-blue-700 dark:text-blue-300'}`}>
                            {target.per_hour_target.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {config.targetMetricLabel}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <TargetIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No targets submitted today</p>
                <Link to={config.addTargetLink}>
                  <Button variant="link" size="sm" className="mt-2">
                    Add morning targets
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* End of Day Card */}
        <Card className="relative overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border-t-2" style={{ borderTopColor: isFinishing ? '#8b5cf6' : '#3b82f6' }}>
          <CardHeader className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <div className={`h-7 w-7 rounded-lg ${config.eodIconBg} flex items-center justify-center`}>
                <ClipboardCheck className={`h-3.5 w-3.5 ${config.eodIconColor}`} />
              </div>
              End of Day
            </CardTitle>
            <div className="flex gap-1 sm:gap-2">
              <Link to={config.viewAllEodLink}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                >
                  View All
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-0.5 sm:ml-1" />
                </Button>
              </Link>
              <Link to={config.addEodLink}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                >
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                  Add
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              skeletonRows
            ) : endOfDay.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {endOfDay.map((update) => (
                  <div
                    key={update.id}
                    onClick={() => onEodClick(update)}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border/50 transition-all duration-200 cursor-pointer group/row"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isFinishing ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-blue-100 dark:bg-blue-500/15'}`}>
                        <ClipboardCheck className={`h-4 w-4 ${isFinishing ? 'text-violet-600 dark:text-violet-400' : 'text-blue-600 dark:text-blue-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {isFinishing
                              ? (update.po_number || "No PO")
                              : update.line_name}
                          </span>
                          {update.has_blocker && (
                            <StatusBadge variant="danger" size="sm" dot>
                              Blocker
                            </StatusBadge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {isFinishing
                            ? `${[update.buyer, update.style].filter(Boolean).join(" • ") || "No details"} • `
                            : `${[update.buyer, update.po_number].filter(Boolean).join(" • ") || "No PO"} • `}
                          {formatTime(update.submitted_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {isFinishing &&
                      update.total_carton != null &&
                      update.total_carton > 0 ? (
                        <div className="flex gap-3">
                          <div>
                            <p className="font-mono font-bold text-lg text-violet-700 dark:text-violet-300">
                              {update.output.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {config.eodMetricLabel}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono font-semibold text-base text-muted-foreground">
                              {update.total_carton.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              cartons
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className={`font-mono font-bold text-lg ${isFinishing ? 'text-violet-700 dark:text-violet-300' : 'text-blue-700 dark:text-blue-300'}`}>
                            {update.output.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {config.eodMetricLabel}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No end of day submissions</p>
                <Link to={config.addEodLink}>
                  <Button variant="link" size="sm" className="mt-2">
                    Add end of day report
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Target vs Actual Comparison — only for line-based stages */}
      {!isFinishing && (
        <TargetVsActualComparison
          allLines={allLines}
          targets={targets.map((t) => ({
            line_uuid: t.line_uuid,
            line_name: t.line_name,
            per_hour_target: t.per_hour_target,
            manpower_planned: t.manpower_planned,
            m_power_planned: t.m_power_planned,
          }))}
          actuals={endOfDay.map((a) => ({
            line_uuid: a.line_uuid,
            line_name: a.line_name,
            output: a.output,
            manpower: a.manpower,
            has_blocker: a.has_blocker,
          }))}
          type={stage}
          loading={loading}
          targetIsDaily={config.targetIsDaily}
        />
      )}
    </>
  );
}
