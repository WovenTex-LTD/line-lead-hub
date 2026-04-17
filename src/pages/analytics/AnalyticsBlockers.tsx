import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useInsightsData, type Period } from "@/hooks/useInsightsData";
import { MetricInfo } from "./MetricInfo";

const BLOCKER_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function AnalyticsBlockers() {
  const { loading, period, setPeriod, blockerBreakdown, summary, dailyData } = useInsightsData("30");

  const pieData = blockerBreakdown.map((b, i) => ({
    name: b.type,
    value: b.count,
    fill: BLOCKER_COLORS[i % BLOCKER_COLORS.length],
  }));

  // Daily blocker trend
  const blockerTrend = dailyData
    .filter(d => d.sewingOutput > 0 || d.blockers > 0)
    .map(d => ({ date: d.displayDate, blockers: d.blockers }));

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Blockers</h1>
          <p className="text-sm text-muted-foreground">What keeps disrupting production?</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[["7","7 days"],["14","14 days"],["30","30 days"],["90","90 days"]].map(([v,l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Total Blockers <MetricInfo tip="Any issue that slowed or stopped a production line — machine breakdowns, material shortages, quality holds, etc." /></div>
                <div className="text-2xl font-bold">{summary.totalBlockers}</div>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="text-xs"><XCircle className="h-3 w-3 mr-1" />{summary.openBlockers} open</Badge>
                  <Badge variant="outline" className="text-xs text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />{summary.resolvedBlockers} resolved</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="text-sm text-muted-foreground mb-1">Most Common</div>
                <div className="text-lg font-bold">{summary.mostCommonBlockerType || "None"}</div>
                <div className="text-xs text-muted-foreground mt-1">{blockerBreakdown[0]?.count || 0} occurrences</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">Avg Blockers / Day <MetricInfo tip="Average number of blocker reports per working day. Lower is better — aim to reduce this over time." /></div>
                <div className="text-2xl font-bold">
                  {summary.daysWithData > 0 ? (summary.totalBlockers / summary.daysWithData).toFixed(1) : "0"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">over {summary.daysWithData} working days</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart */}
            {pieData.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Blocker Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Daily Trend */}
            {blockerTrend.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Daily Blocker Count</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={blockerTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="blockers" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Breakdown Table */}
          {blockerBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Blocker Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Impact</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockerBreakdown.map((b, i) => (
                        <tr key={b.type} className="border-b last:border-0">
                          <td className="p-3 flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: BLOCKER_COLORS[i % BLOCKER_COLORS.length] }} />
                            {b.type}
                          </td>
                          <td className="p-3 text-right font-medium">{b.count}</td>
                          <td className="p-3 text-right">
                            <Badge variant="outline" className="text-xs capitalize">{b.impact}</Badge>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {summary.totalBlockers > 0 ? Math.round((b.count / summary.totalBlockers) * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
