import { Loader2, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, Package } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PeriodComparison } from "@/components/insights/PeriodComparison";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { MetricInfo } from "./MetricInfo";

export default function AnalyticsOverview() {
  const { loading, period, setPeriod, summary, previousPeriodData } = useInsightsData("7");

  const TrendIcon = summary.efficiencyTrend === "up" ? TrendingUp : summary.efficiencyTrend === "down" ? TrendingDown : Minus;
  const effColor = summary.avgEfficiency >= 90 ? "text-green-600" : summary.avgEfficiency >= 70 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="py-6 space-y-6">
      {/* Header + period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Factory-wide health snapshot</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[["7","7 days"],["14","14 days"],["21","21 days"],["30","30 days"],["90","90 days"],["180","6 months"],["365","1 year"]].map(([v,l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <SewingMachine className="h-4 w-4" />Sewing Output
                </div>
                <div className="text-2xl font-bold"><AnimatedNumber value={summary.totalSewingOutput} /></div>
                <div className="text-xs text-muted-foreground mt-1">avg {summary.avgDailyOutput.toLocaleString()}/day · {summary.daysWithData} days</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Package className="h-4 w-4" />Finishing Output
                  <MetricInfo tip="Pieces that passed final quality checks in the finishing department and are ready to ship." />
                </div>
                <div className="text-2xl font-bold"><AnimatedNumber value={summary.totalFinishingQcPass} /></div>
                <div className="text-xs text-muted-foreground mt-1">avg {summary.avgDailyQcPass.toLocaleString()}/day</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Target className="h-4 w-4" />Avg Efficiency
                  <MetricInfo tip="How much of the daily target was actually produced. 100% means the factory hit its target exactly." />
                  <TrendIcon className={`h-3 w-3 ml-auto ${summary.efficiencyTrend === "up" ? "text-green-500" : summary.efficiencyTrend === "down" ? "text-red-500" : "text-muted-foreground"}`} />
                </div>
                <div className={`text-2xl font-bold ${effColor}`}>{summary.avgEfficiency}%</div>
                <div className="text-xs text-muted-foreground mt-1">vs {summary.previousPeriodEfficiency}% prev period</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <AlertTriangle className="h-4 w-4" />Blockers
                  <MetricInfo tip="Issues reported by workers that slowed or stopped production — like machine breakdowns, missing materials, or quality problems." />
                </div>
                <div className="text-2xl font-bold">{summary.totalBlockers}</div>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{summary.openBlockers} open</Badge>
                  <Badge variant="outline" className="text-xs text-green-600">{summary.resolvedBlockers} resolved</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Period Comparison */}
          <PeriodComparison
            currentPeriod={{
              totalOutput: summary.totalSewingOutput,
              totalQcPass: summary.totalFinishingQcPass,
              avgEfficiency: summary.avgEfficiency,
              totalBlockers: summary.totalBlockers,
              avgManpower: summary.avgManpower,
              daysWithData: summary.daysWithData,
            }}
            previousPeriod={previousPeriodData}
            periodDays={parseInt(period)}
          />
        </>
      )}
    </div>
  );
}
