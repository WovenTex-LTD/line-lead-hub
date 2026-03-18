import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, CheckCircle2, AlertTriangle, BarChart3 } from "lucide-react";
import type { FactorySummary } from "./types";

interface LinePerformanceSummaryProps {
  summary: FactorySummary;
  activeLineCount: number;
}

const kpis = [
  {
    key: "output",
    icon: TrendingUp,
    gradient: "from-emerald-500 to-green-600",
    shadow: "shadow-emerald-500/20",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    bg: "from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20",
  },
  {
    key: "avgOutput",
    icon: BarChart3,
    gradient: "from-blue-500 to-indigo-600",
    shadow: "shadow-blue-500/20",
    border: "border-blue-200/60 dark:border-blue-800/40",
    bg: "from-blue-50 via-white to-blue-50/50 dark:from-blue-950/40 dark:via-card dark:to-blue-950/20",
  },
  {
    key: "onTarget",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-teal-600",
    shadow: "shadow-emerald-500/20",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    bg: "from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20",
  },
  {
    key: "below",
    icon: AlertTriangle,
    gradient: "from-red-500 to-rose-600",
    shadow: "shadow-red-500/20",
    border: "border-red-200/60 dark:border-red-800/40",
    bg: "from-red-50 via-white to-red-50/50 dark:from-red-950/40 dark:via-card dark:to-red-950/20",
  },
] as const;

export function LinePerformanceSummary({
  summary,
  activeLineCount,
}: LinePerformanceSummaryProps) {
  const avgDailyOutput = activeLineCount > 0
    ? Math.round(summary.totalOutput / activeLineCount)
    : 0;

  const data = [
    { label: "Total Output",    value: summary.totalOutput > 0 ? summary.totalOutput.toLocaleString() : "—", valueClass: "text-emerald-700 dark:text-emerald-300 font-mono tabular-nums" },
    { label: "Avg Output/Line", value: avgDailyOutput > 0 ? avgDailyOutput.toLocaleString() : "—", valueClass: "text-blue-700 dark:text-blue-300 font-mono tabular-nums" },
    { label: "On Target",       value: String(summary.linesOnTarget), valueClass: "text-emerald-700 dark:text-emerald-300" },
    { label: "Below Target",    value: String(summary.linesBelowTarget), valueClass: summary.linesBelowTarget > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => {
        const Icon = kpi.icon;
        const d = data[i];
        return (
          <Card key={kpi.key} className={cn("relative overflow-hidden hover:shadow-lg transition-all duration-300", kpi.border, `bg-gradient-to-br ${kpi.bg}`)}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-md", kpi.gradient, kpi.shadow)}>
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">{d.label}</p>
              </div>
              <div className={cn("text-xl font-bold", d.valueClass)}>{d.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
