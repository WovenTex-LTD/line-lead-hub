import { useState } from "react";
import { Loader2, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ProgressRing } from "@/components/ui/progress-ring";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { LineDrillDown } from "@/components/insights/LineDrillDown";
import { MetricInfo } from "./MetricInfo";

export default function AnalyticsEfficiency() {
  const { loading, period, setPeriod, linePerformance, dailyData, dateRange } = useInsightsData("7");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedLineName, setSelectedLineName] = useState<string | null>(null);

  const efficiencyData = dailyData.filter(d => d.sewingOutput > 0 || d.sewingTarget > 0).map(d => ({
    date: d.displayDate,
    efficiency: d.efficiency,
  }));

  const sortedByEfficiency = [...linePerformance].sort((a, b) => b.efficiency - a.efficiency);

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Efficiency</h1>
          <p className="text-sm text-muted-foreground">How well resources are converting to output</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[["7","7 days"],["14","14 days"],["21","21 days"],["30","30 days"],["90","90 days"]].map(([v,l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Daily Efficiency Chart */}
          {efficiencyData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Daily Efficiency %</CardTitle>
                  <MetricInfo tip="Actual output divided by target output. The dashed line at 100% means the target was met exactly. Above = ahead of plan, below = behind." />
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={efficiencyData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis domain={[0, 150]} fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Efficiency"]} />
                    <ReferenceLine y={100} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1.5} />
                    <Bar dataKey="efficiency" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Line Ranking */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Line Performance Ranking</CardTitle>
                <MetricInfo tip="Lines ranked by efficiency — how much of their target they produced. Click any line to see its daily breakdown." />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedByEfficiency.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line data for this period.</p>
              ) : (
                sortedByEfficiency.map((line, i) => {
                  const effColor = line.efficiency >= 90 ? "text-green-600" : line.efficiency >= 70 ? "text-yellow-600" : "text-red-600";
                  const ringColor = line.efficiency >= 90 ? "#16a34a" : line.efficiency >= 70 ? "#ca8a04" : "#dc2626";
                  return (
                    <div
                      key={line.lineId}
                      className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedLineId(line.lineId); setSelectedLineName(line.lineName); }}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{line.lineName}</span>
                          <span className="text-xs text-muted-foreground">{line.totalOutput.toLocaleString()} pcs</span>
                        </div>
                        <Progress value={Math.min(line.efficiency, 100)} className="h-1.5 mt-1" />
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">avg/day</div>
                          <div className="text-sm font-medium">{line.avgDailyOutput}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">manpower</div>
                          <div className="text-sm font-medium">{line.avgManpower}</div>
                        </div>
                        <ProgressRing value={line.efficiency} size={40} strokeWidth={3} color={ringColor} />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Line Drill-Down Modal */}
          {selectedLineId && (
            <LineDrillDown
              lineId={selectedLineId}
              lineName={selectedLineName || ""}
              startDate={dateRange.start}
              endDate={dateRange.end}
              onClose={() => setSelectedLineId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
