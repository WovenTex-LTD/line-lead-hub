import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus, TrendingUp, Target, Package, Users, AlertTriangle, GitCompareArrows } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";

interface PeriodData {
  totalOutput: number;
  totalQcPass: number;
  avgEfficiency: number;
  totalBlockers: number;
  avgManpower: number;
  daysWithData: number;
}

interface PeriodComparisonProps {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
  periodDays: number;
}

function calculateChange(current: number, previous: number): { value: number; trend: 'up' | 'down' | 'stable' } {
  if (previous === 0) return { value: current > 0 ? 100 : 0, trend: current > 0 ? 'up' : 'stable' };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(change)),
    trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable'
  };
}

export function PeriodComparison({ currentPeriod, previousPeriod, periodDays }: PeriodComparisonProps) {
  const outputChange = calculateChange(currentPeriod.totalOutput, previousPeriod.totalOutput);
  const qcPassChange = calculateChange(currentPeriod.totalQcPass, previousPeriod.totalQcPass);
  const efficiencyChange = calculateChange(currentPeriod.avgEfficiency, previousPeriod.avgEfficiency);
  const blockerChange = calculateChange(currentPeriod.totalBlockers, previousPeriod.totalBlockers);
  const manpowerChange = calculateChange(currentPeriod.avgManpower, previousPeriod.avgManpower);

  const metrics = [
    {
      label: "Sewing Output",
      icon: SewingMachine,
      current: currentPeriod.totalOutput,
      previous: previousPeriod.totalOutput,
      change: outputChange,
      format: (v: number) => v.toLocaleString(),
      gradient: 'from-blue-500 to-blue-600',
      lightBg: 'from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20',
      borderColor: 'border-blue-200/60 dark:border-blue-800/40',
    },
    {
      label: "Finishing Output",
      icon: Package,
      current: currentPeriod.totalQcPass,
      previous: previousPeriod.totalQcPass,
      change: qcPassChange,
      format: (v: number) => v.toLocaleString(),
      gradient: 'from-violet-500 to-purple-600',
      lightBg: 'from-violet-50 to-purple-100/50 dark:from-violet-950/30 dark:to-purple-900/20',
      borderColor: 'border-violet-200/60 dark:border-violet-800/40',
    },
    {
      label: "Avg Efficiency",
      icon: Target,
      current: currentPeriod.avgEfficiency,
      previous: previousPeriod.avgEfficiency,
      change: efficiencyChange,
      format: (v: number) => `${v}%`,
      gradient: 'from-emerald-500 to-green-600',
      lightBg: 'from-emerald-50 to-green-100/50 dark:from-emerald-950/30 dark:to-green-900/20',
      borderColor: 'border-emerald-200/60 dark:border-emerald-800/40',
    },
    {
      label: "Blockers",
      icon: AlertTriangle,
      current: currentPeriod.totalBlockers,
      previous: previousPeriod.totalBlockers,
      change: blockerChange,
      format: (v: number) => v.toString(),
      inverse: true,
      gradient: 'from-amber-500 to-orange-500',
      lightBg: 'from-amber-50 to-orange-100/50 dark:from-amber-950/30 dark:to-orange-900/20',
      borderColor: 'border-amber-200/60 dark:border-amber-800/40',
    },
    {
      label: "Avg Manpower",
      icon: Users,
      current: currentPeriod.avgManpower,
      previous: previousPeriod.avgManpower,
      change: manpowerChange,
      format: (v: number) => v.toString(),
      gradient: 'from-slate-500 to-slate-600',
      lightBg: 'from-slate-50 to-slate-100/50 dark:from-slate-950/30 dark:to-slate-900/20',
      borderColor: 'border-slate-200/60 dark:border-slate-800/40',
    },
  ];

  return (
    <Card className="shadow-sm overflow-hidden bg-gradient-to-br from-card via-card to-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-sm">
            <GitCompareArrows className="h-3.5 w-3.5 text-white" />
          </div>
          Period Comparison
          <span className="text-[10px] font-semibold text-muted-foreground ml-1 bg-muted/60 px-2.5 py-1 rounded-full uppercase tracking-wider">
            {periodDays}d vs prev {periodDays}d
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const isPositive = metric.inverse ? metric.change.trend === 'down' : metric.change.trend === 'up';
            const isNegative = metric.inverse ? metric.change.trend === 'up' : metric.change.trend === 'down';

            return (
              <div key={metric.label} className={`relative p-3.5 rounded-xl bg-gradient-to-br ${metric.lightBg} border ${metric.borderColor} hover:shadow-md transition-all duration-200 overflow-hidden`}>
                {/* Decorative gradient corner */}
                <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl ${metric.gradient} opacity-[0.06] rounded-bl-full`} />

                {/* Header with icon */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-6 w-6 rounded-md bg-gradient-to-br ${metric.gradient} flex items-center justify-center shadow-sm`}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</span>
                </div>

                {/* Current Value */}
                <p className="text-2xl font-bold font-mono tracking-tight">
                  {metric.format(metric.current)}
                </p>

                {/* Previous + Change */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                  <span className="text-xs text-foreground/60 font-mono font-medium">
                    was <span className="text-foreground/80 font-semibold">{metric.format(metric.previous)}</span>
                  </span>
                  {metric.change.trend === 'stable' ? (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground bg-muted/80 px-2 py-1 rounded-full font-semibold">
                      <Minus className="h-3.5 w-3.5" />
                      ~0%
                    </span>
                  ) : (
                    <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-full ${
                      isPositive ? 'text-emerald-800 dark:text-emerald-200 bg-emerald-500/20' : isNegative ? 'text-red-800 dark:text-red-200 bg-red-500/20' : 'text-muted-foreground bg-muted/80'
                    }`}>
                      {metric.change.trend === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                      {metric.change.value}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
